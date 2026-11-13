import { Logger, Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database';
import { JobScheduler } from '../../shared/jobs';
import { SourceClient, SourceRegistry } from '../../shared/sources';
import { AuthModule } from '../auth/auth.module';
import { Universes } from '../instruments/application/index';
import { UniversesModule } from '../instruments/universes.module';
import { FundamentalsController } from './api/fundamentals.controller';
import { FundamentalsService } from './application/fundamentals';
import { NIFTY_500_LIST } from './application/ports/tokens';
import type { Nifty500List } from './application/ports/fundamentals-store';
import { DrizzleFundamentalsStore } from './infrastructure/drizzle-fundamentals.store';
import { FundamentalsJob } from './infrastructure/fundamentals.job';
import { SCREENER_IN, ScreenerInSource } from './infrastructure/sources/screener-in.source';

const logger = new Logger('Fundamentals');

@Module({
  imports: [AuthModule, UniversesModule],
  controllers: [FundamentalsController],
  providers: [
    // The nightly refresh walks the NIFTY 500 universe; empty (constituents not fetched yet) means it does nothing that night.
    { provide: NIFTY_500_LIST, inject: [Universes], useFactory: (universes: Universes): Nifty500List => ({ symbols: async () => (await universes.members('nifty500', '')).map(m => m.symbol) }) },
    { provide: FundamentalsService, inject: [DB, SourceClient, SourceRegistry], useFactory: (db: Database, client: SourceClient, registry: SourceRegistry) => {
      registry.register(SCREENER_IN);
      return new FundamentalsService(new ScreenerInSource(client), new DrizzleFundamentalsStore(db), { now: Date.now, warn: (message, detail) => { logger.warn({ message, ...detail }); } });
    } },
    { provide: FundamentalsJob, inject: [JobScheduler, FundamentalsService, NIFTY_500_LIST], useFactory: (scheduler: JobScheduler, service: FundamentalsService, list: Nifty500List) => new FundamentalsJob(scheduler, service, list) },
  ],
  exports: [FundamentalsService, NIFTY_500_LIST],
})
export class FundamentalsModule {}
