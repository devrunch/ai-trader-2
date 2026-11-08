import { Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { DB, type Database } from '../../shared/database';
import { REDIS, RedisTokenBucket } from '../../shared/redis';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { KiteModule, KiteSessionService } from '../../shared/vendors/kite';
import { InstrumentHistory } from '../instruments/application/index';
import { JobScheduler } from '../../shared/jobs';
import { ReadinessRegistry } from '../../shared/health';
import { ReadBars } from './application';
import { DrizzleCandleStore } from './infrastructure/drizzle-candle-store';
import { RedisFormingBarStore } from './infrastructure/redis-forming-bar-store';
import { PartitionJob } from './infrastructure/partition.job';
import { RetentionJob } from './infrastructure/retention.job';
import { FillHistory } from './application/fill-history';
import { BackfillHeld } from './application/backfill-held';
import { MARKET_DATA_PROVIDERS, type MarketDataProvider } from './application/ports/market-data-provider';
import { KiteHistoryProvider } from './infrastructure/kite/kite-history.provider';
import { BackfillJob } from './infrastructure/backfill.job';

@Module({
  imports: [KiteModule],
  providers: [
    { provide: RedisTokenBucket, inject: [REDIS], useFactory: (redis: Redis) => new RedisTokenBucket(redis, 'rl:kite:history', 3, 3) },
    { provide: KiteHistoryProvider, inject: [KiteSessionService, RedisTokenBucket, APP_CONFIG],
      useFactory: (session: KiteSessionService, bucket: RedisTokenBucket, config: AppConfig) =>
        new KiteHistoryProvider(session, bucket, config.ZERODHA_API_KEY ?? '') },
    { provide: MARKET_DATA_PROVIDERS, inject: [KiteHistoryProvider],
      useFactory: (kite: KiteHistoryProvider) => new Map<string, MarketDataProvider>([['kite', kite]]) },
    { provide: FillHistory, inject: [DrizzleCandleStore, InstrumentHistory, MARKET_DATA_PROVIDERS],
      useFactory: (store: DrizzleCandleStore, instruments: InstrumentHistory, providers: Map<string, MarketDataProvider>) =>
        new FillHistory(store, instruments, providers) },
    { provide: BackfillHeld, inject: [FillHistory, InstrumentHistory], useFactory: (fill: FillHistory, instruments: InstrumentHistory) => {
      const logger = new Logger('BarsBackfill');
      return new BackfillHeld(fill, instruments, Date.now, { info: value => { logger.log(value); } });
    } },
    { provide: BackfillJob, inject: [JobScheduler, BackfillHeld],
      useFactory: (scheduler: JobScheduler, backfill: BackfillHeld) => new BackfillJob(scheduler, backfill) },
    { provide: DrizzleCandleStore, inject: [DB], useFactory: (db: Database) => new DrizzleCandleStore(db) },
    { provide: RedisFormingBarStore, inject: [REDIS], useFactory: (redis: Redis) => new RedisFormingBarStore(redis) },
    { provide: ReadBars, inject: [DrizzleCandleStore, RedisFormingBarStore, FillHistory],
      useFactory: (store: DrizzleCandleStore, forming: RedisFormingBarStore, fill: FillHistory) => new ReadBars(store, forming, Date.now, fill) },
    { provide: PartitionJob, inject: [DB, JobScheduler, ReadinessRegistry],
      useFactory: (db: Database, jobs: JobScheduler, ready: ReadinessRegistry) => new PartitionJob(db, jobs, ready) },
    { provide: RetentionJob, inject: [DB, JobScheduler], useFactory: (db: Database, jobs: JobScheduler) => new RetentionJob(db, undefined, jobs) },
  ],
  exports: [ReadBars],
})
export class MarketDataModule {}
