import { randomUUID } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { DB, type Database } from '../../shared/database';
import { REDIS } from '../../shared/redis';
import { AuthModule } from '../auth/auth.module';
import { SearchInstruments } from '../instruments/application/index';
import { InstrumentsModule } from '../instruments/instruments.module';
import { GetQuote, MarketDataService } from '../market-data/application/index';
import { MarketDataModule } from '../market-data/market-data.module';
import { ReadPortfolio } from '../paper-trading/application/index';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { ChatController } from './api/chat.controller';
import { PromptsController } from './api/prompts.controller';
import { ChatService, type AgentRunner, type WindowLimiter } from './application/chat-service';
import { PromptRegistry } from './application/prompt-registry';
import { buildReadTools } from './application/read-tools';
import { Threads } from './application/threads';
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

interface ToolServices { quote: GetQuote; market: MarketDataService; search: SearchInstruments; portfolio: ReadPortfolio }

/** No AGENT_MODEL: the assistant is off and says so. A bad model setting fails at boot, naming the .env key. */
function createRunner(config: AppConfig, services: ToolServices, limiter: WindowLimiter): AgentRunner | null {
  if (!config.AGENT_MODEL) { logger.warn('Assistant disabled: AGENT_MODEL is not set'); return null; }
  const primary = createLanguageModel(parseModelSpec(config.AGENT_MODEL), config);
  const fallback = config.AGENT_FALLBACK_MODEL ? createLanguageModel(parseModelSpec(config.AGENT_FALLBACK_MODEL), config) : undefined;
  const tools = buildReadTools(services, {
    limiter: { take: key => limiter.take(key, ...toolLimit(key)) },
    audit: entry => { logger.log({ message: 'agent tool call', tool: entry.tool, userId: entry.userId, conversationId: entry.conversationId, turnId: entry.turnId, outcome: entry.outcome, ms: entry.ms }); },
  });
  logger.log(`Assistant model ${config.AGENT_MODEL}${config.AGENT_FALLBACK_MODEL ? `, fallback ${config.AGENT_FALLBACK_MODEL}` : ''}`);
  return new MastraRunner({ name: config.AGENT_MODEL, primary, ...(fallback ? { fallback } : {}), tools });
}

@Module({
  imports: [AuthModule, InstrumentsModule, MarketDataModule, PaperTradingModule],
  controllers: [PromptsController, ChatController],
  providers: [
    { provide: PromptRegistry, inject: [DB], useFactory: (db: Database) => new PromptRegistry(new DrizzlePromptStore(db), new FilePromptDefaults()) },
    { provide: LIMITER, inject: [REDIS], useFactory: (redis: Redis) => new RedisWindowLimiter(redis) },
    { provide: RUNNER, inject: [APP_CONFIG, GetQuote, MarketDataService, SearchInstruments, ReadPortfolio, LIMITER],
      useFactory: (config: AppConfig, quote: GetQuote, market: MarketDataService, search: SearchInstruments, portfolio: ReadPortfolio, limiter: WindowLimiter) =>
        createRunner(config, { quote, market, search, portfolio }, limiter) },
    { provide: ChatService, inject: [RUNNER, PromptRegistry, DB, LIMITER, APP_CONFIG],
      useFactory: (runner: AgentRunner | null, prompts: PromptRegistry, db: Database, limiter: WindowLimiter, config: AppConfig) =>
        new ChatService(runner, prompts, { turns: new DrizzleTurnStore(db), threads: new DrizzleThreadStore(db) }, limiter,
          { dailyTurns: config.AGENT_DAILY_TURNS, maxRounds: config.AGENT_MAX_ROUNDS, turnTimeoutMs: config.AGENT_TURN_TIMEOUT_MS, maxTokens: config.AGENT_MAX_TOKENS },
          { now: Date.now, id: randomUUID }) },
    { provide: Threads, inject: [DB], useFactory: (db: Database) => new Threads(new DrizzleThreadStore(db)) },
  ],
  exports: [PromptRegistry],
})
export class AgentModule {}
