import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { DB, type Database } from '../../shared/database';
import { REDIS } from '../../shared/redis';
import { JobScheduler } from '../../shared/jobs';
import { ReadinessRegistry } from '../../shared/health';
import { ReadBars } from './application';
import { DrizzleCandleStore } from './infrastructure/drizzle-candle-store';
import { RedisFormingBarStore } from './infrastructure/redis-forming-bar-store';
import { PartitionJob } from './infrastructure/partition.job';
import { RetentionJob } from './infrastructure/retention.job';

@Module({
  providers: [
    { provide: DrizzleCandleStore, inject: [DB], useFactory: (db: Database) => new DrizzleCandleStore(db) },
    { provide: RedisFormingBarStore, inject: [REDIS], useFactory: (redis: Redis) => new RedisFormingBarStore(redis) },
    { provide: ReadBars, inject: [DrizzleCandleStore, RedisFormingBarStore],
      useFactory: (store: DrizzleCandleStore, forming: RedisFormingBarStore) => new ReadBars(store, forming) },
    { provide: PartitionJob, inject: [DB, JobScheduler, ReadinessRegistry],
      useFactory: (db: Database, jobs: JobScheduler, ready: ReadinessRegistry) => new PartitionJob(db, jobs, ready) },
    { provide: RetentionJob, inject: [DB, JobScheduler], useFactory: (db: Database, jobs: JobScheduler) => new RetentionJob(db, undefined, jobs) },
  ],
  exports: [ReadBars],
})
export class MarketDataModule {}
