import { Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { DB, type Database } from '../../shared/database';
import { JobScheduler } from '../../shared/jobs';
import { REDIS, RedisTokenBucket } from '../../shared/redis';
import { KiteModule, KiteSessionService } from '../../shared/vendors/kite';
import { AuthModule } from '../auth/auth.module';
import { OptionContractList } from '../instruments/application/index';
import { InstrumentsModule } from '../instruments/instruments.module';
import { OptionsController } from './api/options.controller';
import { OptionsService } from './application/options';
import { DrizzleOptionSnapshotStore } from './infrastructure/drizzle-option-snapshot.store';
import { KiteOptionQuotes } from './infrastructure/kite-option-quotes';
import { OptionSnapshotJob } from './infrastructure/option-snapshot.job';

const logger = new Logger('Options');
const STORE = Symbol('OPTION_SNAPSHOT_STORE');

@Module({
  imports: [AuthModule, KiteModule, InstrumentsModule],
  controllers: [OptionsController],
  providers: [
    { provide: STORE, inject: [DB], useFactory: (db: Database) => new DrizzleOptionSnapshotStore(db) },
    { provide: OptionsService, inject: [STORE, OptionContractList, KiteSessionService, REDIS, APP_CONFIG],
      useFactory: (store: DrizzleOptionSnapshotStore, contracts: OptionContractList, session: KiteSessionService, redis: Redis, config: AppConfig) => new OptionsService(
        { list: async (underlying, today, signal) => {
          const listed = await contracts.list(underlying, today, signal);
          return listed && { spotSymbol: listed.spotSymbol, contracts: listed.contracts.map(c => ({ symbol: c.providerSymbol, strike: c.strike, type: c.optionType, expiry: c.expiry })) };
        } },
        // The same 1 request/second quote bucket the previous-close source uses, so both stay inside Kite's quote limit.
        new KiteOptionQuotes(session, new RedisTokenBucket(redis, 'rl:kite:quote', 1, 1), config.ZERODHA_API_KEY ?? ''), store,
        { now: Date.now, warn: (message, detail) => { logger.warn({ message, ...detail }); } }) },
    { provide: OptionSnapshotJob, inject: [JobScheduler, OptionsService, STORE], useFactory: (scheduler: JobScheduler, options: OptionsService, store: DrizzleOptionSnapshotStore) => new OptionSnapshotJob(scheduler, options, store) },
  ],
  exports: [OptionsService],
})
export class OptionsModule {}
