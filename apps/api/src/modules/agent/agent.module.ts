import { randomUUID } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { PineCheck } from '@aitrader/contracts';
import { ValidationError } from '../../shared/errors';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { DB, type Database } from '../../shared/database';
import { JobScheduler } from '../../shared/jobs';
import { REDIS } from '../../shared/redis';
import { AuthModule } from '../auth/auth.module';
import { IndicatorService } from '../indicators/application/index';
import { PineScripts } from '../pine-scripts/application/index';
import { PineScriptsModule } from '../pine-scripts/pine-scripts.module';
import { IndicatorsModule } from '../indicators/indicators.module';
import { SearchInstruments } from '../instruments/application/index';
import { InstrumentsModule } from '../instruments/instruments.module';
import { GetQuote, MarketDataService } from '../market-data/application/index';
import { MarketDataModule } from '../market-data/market-data.module';
import { NewsService } from '../news/application/index';
import { NewsModule } from '../news/news.module';
import { EconomicCalendar } from '../calendar/application/index';
import { BACKTEST, ComputeModule } from '../compute/compute.module';
import type { RunBacktest } from '../compute/application/index';
import { buildBacktestTools } from './application/backtest-tools';
import { CalendarModule } from '../calendar/calendar.module';
import { Watchlists } from '../watchlists/application/index';
import { WatchlistsModule } from '../watchlists/watchlists.module';
import { Notifications } from '../notifications/application/index';
import { NotificationsModule } from '../notifications/notifications.module';
import { CancelOrder, PlaceOrder, ReadPortfolio } from '../paper-trading/application/index';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { ActionsController } from './api/actions.controller';
import { ChatController } from './api/chat.controller';
import { TasksController } from './api/tasks.controller';
import { PromptsController } from './api/prompts.controller';
import { ActionCards } from './application/action-cards';
import { AgentTasks } from './application/agent-tasks';
import { buildCalcTool, buildCalendarTools, buildMemoryTools, buildNewsTools, buildPaperTools, buildSkillTools, buildTaskTools, buildWatchlistTools } from './application/power-tools';
import { AgentMemory } from './application/agent-memory';
import { DrizzleMemoryStore } from './infrastructure/drizzle-memory.store';
import { MemoryController } from './api/memory.controller';
import { buildActionTools, buildIndicatorTools } from './application/action-tools';
import { ChatService, type AgentRunner, type WindowLimiter } from './application/chat-service';
import { DrawingService } from './application/drawing-service';
import { PromptRegistry } from './application/prompt-registry';
import { buildReadTools } from './application/read-tools';
import { Threads } from './application/threads';
import { AgentTrader, BackgroundRuns, TradeLog, type TradeJournal } from './application/agent-trader';
import { BrokerVenue, VenueRouter } from './application/execution-venue';
import { EXECUTION_SETTINGS, TradesController, type ExecutionSettings } from './api/trades.controller';
import { DrizzleExecutionPrefs } from './infrastructure/drizzle-execution-prefs';
import { DrizzleTradeJournal } from './infrastructure/drizzle-trade-journal';
import { PaperVenue } from './infrastructure/paper-venue';
import { AgentTaskJob } from './infrastructure/agent-task.job';
import { MarketConditionReader } from './infrastructure/condition-reader';
import { FeedWatchReader } from './infrastructure/feed-watch-reader';
import { DrizzleActionStore } from './infrastructure/drizzle-action.store';
import { DrizzleTaskStore } from './infrastructure/drizzle-task.store';
import { DrizzleThreadStore, DrizzleTurnStore } from './infrastructure/drizzle-chat.stores';
import { DrizzlePromptStore } from './infrastructure/drizzle-prompt.store';
import { FilePromptDefaults } from './infrastructure/file-prompt.defaults';
import { MastraRunner } from './infrastructure/mastra-runner';
import { createLanguageModel, parseModelSpec } from './infrastructure/models/model-factory';
import { RedisWindowLimiter } from './infrastructure/redis-window-limiter';

const logger = new Logger('Agent');
const RUNNER = Symbol('AGENT_RUNNER');
const LIMITER = Symbol('AGENT_LIMITER');
const TRADE_JOURNAL = Symbol('AGENT_TRADE_JOURNAL');
const toolLimit = (key: string): [number, number] => (key.startsWith('agent:conversation:') ? [120, 600_000] : [30, 60_000]);

interface ToolServices {
  quote: GetQuote; market: MarketDataService; search: SearchInstruments; portfolio: ReadPortfolio; indicators: IndicatorService; cards: ActionCards;
  trader: AgentTrader; runs: BackgroundRuns; place: PlaceOrder; cancel: CancelOrder; prompts: PromptRegistry; tasks: AgentTasks; news: NewsService; watchlist: Watchlists; memory: AgentMemory; calendar: EconomicCalendar; backtest: RunBacktest | null;
}

/** No AGENT_MODEL: the assistant is off and says so. A bad model setting fails at boot, naming the .env key. */
function createRunner(config: AppConfig, services: ToolServices, limiter: WindowLimiter): AgentRunner | null {
  if (!config.AGENT_MODEL) { logger.warn('Assistant disabled: AGENT_MODEL is not set'); return null; }
  const primary = createLanguageModel(parseModelSpec(config.AGENT_MODEL), config);
  const fallback = config.AGENT_FALLBACK_MODEL ? createLanguageModel(parseModelSpec(config.AGENT_FALLBACK_MODEL), config) : undefined;
  const deps = {
    limiter: { take: (key: string) => limiter.take(key, ...toolLimit(key)) },
    audit: (entry: { tool: string; userId: string; conversationId: string; turnId: string; outcome: string; ms: number }) => {
      logger.log({ message: 'agent tool call', tool: entry.tool, userId: entry.userId, conversationId: entry.conversationId, turnId: entry.turnId, outcome: entry.outcome, ms: entry.ms });
    },
  };
  const tools = [...buildReadTools(services, deps), ...buildIndicatorTools(services.indicators, deps), ...buildActionTools(services.cards, deps),
    ...buildCalcTool(deps), ...buildSkillTools(services.prompts, deps), ...buildPaperTools(services.trader, deps, { runs: services.runs, propose: (userId, action) => services.cards.propose(userId, action) }), ...buildTaskTools(services.tasks, deps), ...buildNewsTools(services.news, deps), ...buildWatchlistTools(services.watchlist, deps), ...buildMemoryTools(services.memory, deps), ...buildCalendarTools(services.calendar, deps),
    ...buildBacktestTools({ market: services.market, compute: request => services.indicators.compute(request), backtest: services.backtest }, deps,
      (ctx, summary) => { services.runs.noteBacktest(ctx.conversationId, summary); })];
  logger.log(`Assistant model ${config.AGENT_MODEL}${config.AGENT_FALLBACK_MODEL ? `, fallback ${config.AGENT_FALLBACK_MODEL}` : ''}`);
  return new MastraRunner({ name: config.AGENT_MODEL, primary, ...(fallback ? { fallback } : {}), tools });
}

/** The runtime's description of a script, or the error with its line; an unavailable runtime stays an error to the caller. */
async function checkPine(indicators: IndicatorService, source: string): Promise<PineCheck> {
  try { return { ok: true, definition: await indicators.describe(source) }; }
  catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    const line = error.details?.['line'];
    return { ok: false, error: error.message.slice(0, 300), ...(typeof line === 'number' && line > 0 ? { line } : {}) };
  }
}

@Module({
  imports: [AuthModule, InstrumentsModule, MarketDataModule, PaperTradingModule, IndicatorsModule, PineScriptsModule, NewsModule, NotificationsModule, WatchlistsModule, CalendarModule, ComputeModule],
  controllers: [PromptsController, ChatController, ActionsController, TasksController, MemoryController, TradesController],
  providers: [
    { provide: PromptRegistry, inject: [DB], useFactory: (db: Database) => new PromptRegistry(new DrizzlePromptStore(db), new FilePromptDefaults()) },
    { provide: LIMITER, inject: [REDIS], useFactory: (redis: Redis) => new RedisWindowLimiter(redis) },
    { provide: TRADE_JOURNAL, inject: [DB], useFactory: (db: Database): TradeJournal => new DrizzleTradeJournal(db) },
    { provide: DrizzleExecutionPrefs, inject: [DB], useFactory: (db: Database) => new DrizzleExecutionPrefs(db) },
    { provide: VenueRouter, inject: [ReadPortfolio, PlaceOrder, CancelOrder, GetQuote, DrizzleExecutionPrefs, APP_CONFIG],
      useFactory: (portfolio: ReadPortfolio, place: PlaceOrder, cancel: CancelOrder, quote: GetQuote, prefs: DrizzleExecutionPrefs, config: AppConfig) =>
        new VenueRouter(new PaperVenue({ place, cancel, portfolio, quote }), new BrokerVenue(), prefs, { mode: config.EXECUTION_MODE, nodeEnv: config.NODE_ENV }) },
    { provide: EXECUTION_SETTINGS, inject: [DrizzleExecutionPrefs, APP_CONFIG],
      useFactory: (prefs: DrizzleExecutionPrefs, config: AppConfig): ExecutionSettings => ({ mode: config.EXECUTION_MODE, allowed: config.EXECUTION_MODE === 'broker' && config.NODE_ENV !== 'production',
        enabled: userId => prefs.enabled(userId), set: (userId, value) => prefs.set(userId, value) }) },
    { provide: AgentTrader, inject: [VenueRouter, TRADE_JOURNAL],
      useFactory: (venues: VenueRouter, journal: TradeJournal) => new AgentTrader(venues.routed(), journal, { now: Date.now, id: randomUUID }) },
    { provide: TradeLog, inject: [VenueRouter, TRADE_JOURNAL], useFactory: (venues: VenueRouter, journal: TradeJournal) => new TradeLog(journal, venues.routed()) },
    { provide: BackgroundRuns, useFactory: () => new BackgroundRuns() },
    { provide: ActionCards, inject: [DB, IndicatorService, MarketDataService, PineScripts, AgentTrader],
      useFactory: (db: Database, indicators: IndicatorService, market: MarketDataService, scripts: PineScripts, trader: AgentTrader) => {
        const drawings = new DrawingService(market);
        return new ActionCards(new DrizzleActionStore(db), { indicators: () => indicators.list(), draw: intent => drawings.compute(intent), checkPine: source => checkPine(indicators, source),
          savePine: async (userId, name, source) => (await scripts.create(userId, { name, source })).id,
          submitOrder: async (userId, a) => {
            const clientOrderId = `agent-card-${randomUUID().slice(0, 8)}`;
            await trader.enter(userId, a, { taskId: null, trigger: 'confirmed proposal', skill: null, rationale: a.rationale, backtest: null, clientOrderId });
            return clientOrderId;
          } }, { now: Date.now, id: randomUUID });
      } },
    { provide: AgentTasks, inject: [DB, GetQuote, IndicatorService, NewsService, EconomicCalendar],
      useFactory: (db: Database, quote: GetQuote, indicators: IndicatorService, news: NewsService, calendar: EconomicCalendar) =>
        new AgentTasks(new DrizzleTaskStore(db), new MarketConditionReader(quote, indicators), new FeedWatchReader(news, calendar, quote), { now: Date.now, id: randomUUID }) },
    { provide: RUNNER, inject: [APP_CONFIG, GetQuote, MarketDataService, SearchInstruments, ReadPortfolio, IndicatorService, ActionCards, PlaceOrder, CancelOrder, PromptRegistry, AgentTasks, NewsService, Watchlists, AgentMemory, EconomicCalendar, BACKTEST, LIMITER, AgentTrader, BackgroundRuns],
      useFactory: (config: AppConfig, quote: GetQuote, market: MarketDataService, search: SearchInstruments, portfolio: ReadPortfolio, indicators: IndicatorService,
        cards: ActionCards, place: PlaceOrder, cancel: CancelOrder, prompts: PromptRegistry, tasks: AgentTasks, news: NewsService, watchlist: Watchlists, memory: AgentMemory, calendar: EconomicCalendar, backtest: RunBacktest | null, limiter: WindowLimiter, trader: AgentTrader, runs: BackgroundRuns) =>
        createRunner(config, { quote, market, search, portfolio, indicators, cards, trader, runs, place, cancel, prompts, tasks, news, watchlist, memory, calendar, backtest }, limiter) },
    { provide: AgentMemory, inject: [DB], useFactory: (db: Database) => new AgentMemory(new DrizzleMemoryStore(db), { id: randomUUID }) },
    { provide: ChatService, inject: [RUNNER, PromptRegistry, DB, LIMITER, APP_CONFIG, AgentMemory],
      useFactory: (runner: AgentRunner | null, prompts: PromptRegistry, db: Database, limiter: WindowLimiter, config: AppConfig, memory: AgentMemory) =>
        new ChatService(runner, prompts, { turns: new DrizzleTurnStore(db), threads: new DrizzleThreadStore(db), memory }, limiter,
          { dailyTurns: config.AGENT_DAILY_TURNS, maxRounds: config.AGENT_MAX_ROUNDS, turnTimeoutMs: config.AGENT_TURN_TIMEOUT_MS, maxTokens: config.AGENT_MAX_TOKENS },
          { now: Date.now, id: randomUUID }) },
    { provide: Threads, inject: [DB], useFactory: (db: Database) => new Threads(new DrizzleThreadStore(db)) },
    { provide: AgentTaskJob, inject: [JobScheduler, AgentTasks, ChatService, Notifications, LIMITER, APP_CONFIG, BackgroundRuns],
      useFactory: (scheduler: JobScheduler, tasks: AgentTasks, chat: ChatService, notifications: Notifications, limiter: WindowLimiter, config: AppConfig, runs: BackgroundRuns) =>
        new AgentTaskJob(scheduler, tasks, chat, notifications, { limiter, dailyRuns: config.AGENT_WATCH_DAILY_RUNS, now: Date.now }, runs) },
  ],
  exports: [PromptRegistry],
})
export class AgentModule {}
