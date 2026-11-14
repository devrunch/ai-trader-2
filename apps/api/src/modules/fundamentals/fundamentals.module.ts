import { Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { REDIS } from '../../shared/redis';
import { DB, type Database } from '../../shared/database';
import { JobScheduler } from '../../shared/jobs';
import { SourceClient, SourceRegistry } from '../../shared/sources';
import { AuthModule } from '../auth/auth.module';
import { Universes } from '../instruments/application/index';
import { EconomicCalendar } from '../calendar/application/index';
import { CalendarModule } from '../calendar/calendar.module';
import { UniversesModule } from '../instruments/universes.module';
import { FundamentalsController } from './api/fundamentals.controller';
import { FundamentalsService } from './application/fundamentals';
import { UsFundamentalsService } from './application/us-fundamentals';
import { FINNHUB_METRICS, FinnhubMetricsSource } from './infrastructure/sources/finnhub-metrics.source';
import { NIFTY_500_LIST } from './application/ports/tokens';
import type { Nifty500List } from './application/ports/fundamentals-store';
import { DrizzleFundamentalsStore } from './infrastructure/drizzle-fundamentals.store';
import { FundamentalsJob } from './infrastructure/fundamentals.job';
import { SCREENER_IN, ScreenerInSource } from './infrastructure/sources/screener-in.source';

const logger = new Logger('Fundamentals');

@Module({
  imports: [AuthModule, UniversesModule, CalendarModule],
  controllers: [FundamentalsController],
  providers: [
    // The nightly refresh walks the NIFTY 500 universe; empty (constituents not fetched yet) means it does nothing that night.
    { provide: NIFTY_500_LIST, inject: [Universes], useFactory: (universes: Universes): Nifty500List => ({ symbols: async () => (await universes.members('nifty500', '')).map(m => m.symbol) }) },
    { provide: FundamentalsService, inject: [DB, SourceClient, SourceRegistry, EconomicCalendar], useFactory: (db: Database, client: SourceClient, registry: SourceRegistry, calendar: EconomicCalendar) => {
      registry.register(SCREENER_IN);
      return new FundamentalsService(new ScreenerInSource(client), new DrizzleFundamentalsStore(db), { now: Date.now, warn: (message, detail) => { logger.warn({ message, ...detail }); }, onResultsDate: (symbol, date) => calendar.recordCompanyResults(symbol, date) });
    } },
    { provide: UsFundamentalsService, inject: [APP_CONFIG, SourceClient, SourceRegistry, REDIS], useFactory: (config: AppConfig, client: SourceClient, registry: SourceRegistry, redis: Redis) => {
      registry.register(FINNHUB_METRICS);
      return new UsFundamentalsService(new FinnhubMetricsSource(client, config.FINNHUB_API_KEY), {
        get: key => redis.get(key), set: async (key, value, ttlSec) => { await redis.set(key, value, 'EX', ttlSec); } });
    } },
    { provide: FundamentalsJob, inject: [JobScheduler, FundamentalsService, NIFTY_500_LIST], useFactory: (scheduler: JobScheduler, service: FundamentalsService, list: Nifty500List) => new FundamentalsJob(scheduler, service, list) },
  ],
  exports: [FundamentalsService, UsFundamentalsService, NIFTY_500_LIST],
})
export class FundamentalsModule {}
