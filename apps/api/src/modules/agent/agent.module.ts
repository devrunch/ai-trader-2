import { randomUUID } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { DB, type Database } from '../../shared/database';
import { JobScheduler } from '../../shared/jobs';
import { REDIS } from '../../shared/redis';
import { AuthModule } from '../auth/auth.module';
import { IndicatorService } from '../indicators/application/index';
import { IndicatorsModule } from '../indicators/indicators.module';
import { SearchInstruments } from '../instruments/application/index';
import { InstrumentsModule } from '../instruments/instruments.module';
import { GetQuote, MarketDataService } from '../market-data/application/index';
import { MarketDataModule } from '../market-data/market-data.module';
import { NewsService } from '../news/application/index';
import { NewsModule } from '../news/news.module';
import { CancelOrder, PlaceOrder, ReadPortfolio } from '../paper-trading/application/index';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { ActionsController } from './api/actions.controller';
import { ChatController } from './api/chat.controller';
import { TasksController } from './api/tasks.controller';
import { PromptsController } from './api/prompts.controller';
import { ActionCards } from './application/action-cards';
import { AgentTasks } from './application/agent-tasks';
import { buildCalcTool, buildNewsTools, buildPaperTools, buildSkillTools, buildTaskTools } from './application/power-tools';
import { buildActionTools, buildIndicatorTools } from './application/action-tools';
import { ChatService, type AgentRunner, type WindowLimiter } from './application/chat-service';
import { DrawingService } from './application/drawing-service';
import { PromptRegistry } from './application/prompt-registry';
import { buildReadTools } from './application/read-tools';
import { Threads } from './application/threads';
import { AgentTaskJob } from './infrastructure/agent-task.job';
import { MarketConditionReader } from './infrastructure/condition-reader';
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
const toolLimit = (key: string): [number, number] => (key.startsWith('agent:conversation:') ? [120, 600_000] : [30, 60_000]);

interface ToolServices {
  quote: GetQuote; market: MarketDataService; search: SearchInstruments; portfolio: ReadPortfolio; indicators: IndicatorService; cards: ActionCards;
  place: PlaceOrder; cancel: CancelOrder; prompts: PromptRegistry; tasks: AgentTasks; news: NewsService;
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
  const desk = { place: services.place.execute.bind(services.place), cancel: services.cancel.execute.bind(services.cancel),
    positions: (userId: string) => services.portfolio.positions(userId) };
  const tools = [...buildReadTools(services, deps), ...buildIndicatorTools(services.indicators, deps), ...buildActionTools(services.cards, deps),
    ...buildCalcTool(deps), ...buildSkillTools(services.prompts, deps), ...buildPaperTools(desk, deps), ...buildTaskTools(services.tasks, deps), ...buildNewsTools(services.news, deps)];
  logger.log(`Assistant model ${config.AGENT_MODEL}${config.AGENT_FALLBACK_MODEL ? `, fallback ${config.AGENT_FALLBACK_MODEL}` : ''}`);
  return new MastraRunner({ name: config.AGENT_MODEL, primary, ...(fallback ? { fallback } : {}), tools });
}

@Module({
  imports: [AuthModule, InstrumentsModule, MarketDataModule, PaperTradingModule, IndicatorsModule, NewsModule],
  controllers: [PromptsController, ChatController, ActionsController, TasksController],
  providers: [
    { provide: PromptRegistry, inject: [DB], useFactory: (db: Database) => new PromptRegistry(new DrizzlePromptStore(db), new FilePromptDefaults()) },
    { provide: LIMITER, inject: [REDIS], useFactory: (redis: Redis) => new RedisWindowLimiter(redis) },
    { provide: ActionCards, inject: [DB, IndicatorService, MarketDataService],
      useFactory: (db: Database, indicators: IndicatorService, market: MarketDataService) => {
        const drawings = new DrawingService(market);
        return new ActionCards(new DrizzleActionStore(db), { indicators: () => indicators.list(), draw: intent => drawings.compute(intent) }, { now: Date.now, id: randomUUID });
      } },
    { provide: AgentTasks, inject: [DB, GetQuote, IndicatorService],
      useFactory: (db: Database, quote: GetQuote, indicators: IndicatorService) =>
        new AgentTasks(new DrizzleTaskStore(db), new MarketConditionReader(quote, indicators), { now: Date.now, id: randomUUID }) },
    { provide: RUNNER, inject: [APP_CONFIG, GetQuote, MarketDataService, SearchInstruments, ReadPortfolio, IndicatorService, ActionCards, PlaceOrder, CancelOrder, PromptRegistry, AgentTasks, NewsService, LIMITER],
      useFactory: (config: AppConfig, quote: GetQuote, market: MarketDataService, search: SearchInstruments, portfolio: ReadPortfolio, indicators: IndicatorService,
        cards: ActionCards, place: PlaceOrder, cancel: CancelOrder, prompts: PromptRegistry, tasks: AgentTasks, news: NewsService, limiter: WindowLimiter) =>
        createRunner(config, { quote, market, search, portfolio, indicators, cards, place, cancel, prompts, tasks, news }, limiter) },
    { provide: ChatService, inject: [RUNNER, PromptRegistry, DB, LIMITER, APP_CONFIG],
      useFactory: (runner: AgentRunner | null, prompts: PromptRegistry, db: Database, limiter: WindowLimiter, config: AppConfig) =>
        new ChatService(runner, prompts, { turns: new DrizzleTurnStore(db), threads: new DrizzleThreadStore(db) }, limiter,
          { dailyTurns: config.AGENT_DAILY_TURNS, maxRounds: config.AGENT_MAX_ROUNDS, turnTimeoutMs: config.AGENT_TURN_TIMEOUT_MS, maxTokens: config.AGENT_MAX_TOKENS },
          { now: Date.now, id: randomUUID }) },
    { provide: Threads, inject: [DB], useFactory: (db: Database) => new Threads(new DrizzleThreadStore(db)) },
    { provide: AgentTaskJob, inject: [JobScheduler, AgentTasks, ChatService],
      useFactory: (scheduler: JobScheduler, tasks: AgentTasks, chat: ChatService) => new AgentTaskJob(scheduler, tasks, chat) },
  ],
  exports: [PromptRegistry],
})
export class AgentModule {}
