import { Global, Inject, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { DB, type Database } from '../../shared/database/index.js';
import { JobScheduler } from '../../shared/jobs/index.js';
import { ReadinessRegistry } from '../../shared/health/index.js';
import { RefreshInstruments, ResolveInstrument, SearchInstruments, InstrumentHistory, ListInstrumentSources, OptionContractList } from './application/index.js';
import { POPULAR_INSTRUMENTS } from './infrastructure/popular-instruments';
import { INSTRUMENT_REPOSITORY, type InstrumentRepository } from './application/ports/instrument-repository.js';
import { INSTRUMENT_SOURCES, type InstrumentSource } from './application/ports/instrument-source.js';
import { SEARCH_INDEX, type SearchIndex } from './application/ports/search-index.js';
import { DrizzleInstrumentRepository } from './infrastructure/drizzle-instrument.repository.js';
import { RefreshJob } from './infrastructure/refresh.job.js';
import { DerivSource, KiteSource, NasdaqSource } from './infrastructure/sources/index.js';

import { SourceRegistry } from '../../shared/sources/index.js';
import { NASDAQ_TRADER_DESCRIPTOR } from './infrastructure/sources/descriptors.js';
import { MiniSearchIndex } from './infrastructure/minisearch-index.js';
import { InstrumentsController } from './api/instruments.controller.js';
import { CLOCK, InstrumentsRateLimitGuard } from './api/instruments-rate-limit.guard.js';
import { REDIS } from '../../shared/redis/index.js';
import type { Redis } from 'ioredis';
import { RedisRefreshLock } from './infrastructure/redis-refresh-lock.js';

@Global()
@Module({
  providers: [
    { provide: 'INSTRUMENT_SOURCE_DESCRIPTORS', inject: [SourceRegistry], useFactory: (registry: SourceRegistry) => { registry.register(NASDAQ_TRADER_DESCRIPTOR); return true; } },
    { provide: ListInstrumentSources, inject: [INSTRUMENT_REPOSITORY], useFactory: (repo: InstrumentRepository) => new ListInstrumentSources(repo) },
    { provide: OptionContractList, inject: [INSTRUMENT_REPOSITORY], useFactory: (repo: InstrumentRepository) => new OptionContractList(repo) },
    { provide: InstrumentHistory, inject: [INSTRUMENT_REPOSITORY],
      useFactory: (repo: InstrumentRepository) => new InstrumentHistory(repo, POPULAR_INSTRUMENTS) },
    { provide: CLOCK, useValue: Date.now },
    InstrumentsRateLimitGuard,
    { provide: SearchInstruments, inject: [SEARCH_INDEX], useFactory: (index: SearchIndex) => new SearchInstruments(index) },
    { provide: INSTRUMENT_REPOSITORY, inject: [DB], useFactory: (db: Database) => new DrizzleInstrumentRepository(db) },
    { provide: INSTRUMENT_SOURCES, useFactory: (): InstrumentSource[] => [new KiteSource(), new DerivSource(), new NasdaqSource()] },
    { provide: SEARCH_INDEX, useClass: MiniSearchIndex },
    { provide: RefreshInstruments, inject: [INSTRUMENT_REPOSITORY, INSTRUMENT_SOURCES, SEARCH_INDEX, REDIS],
      useFactory: (repo: InstrumentRepository, sources: InstrumentSource[], index: SearchIndex, redis: Redis) =>
        new RefreshInstruments(repo, sources, index, () => new Date(), new Logger('RefreshInstruments'), new RedisRefreshLock(redis)) },
    { provide: ResolveInstrument, inject: [INSTRUMENT_REPOSITORY, SEARCH_INDEX],
      useFactory: (repo: InstrumentRepository, index: SearchIndex) => new ResolveInstrument(repo, index) },
    { provide: RefreshJob, inject: [JobScheduler, RefreshInstruments, DB, ReadinessRegistry],
      useFactory: (scheduler: JobScheduler, refresh: RefreshInstruments, db: Database, readiness: ReadinessRegistry) =>
        new RefreshJob(scheduler, refresh, db, readiness) },
  ],
  exports: [OptionContractList, RefreshInstruments, ResolveInstrument, SearchInstruments, InstrumentHistory, ListInstrumentSources, CLOCK, InstrumentsRateLimitGuard],
})
export class InstrumentsModule implements OnApplicationBootstrap {
  constructor(@Inject(INSTRUMENT_REPOSITORY) private readonly repository: InstrumentRepository,
    @Inject(SEARCH_INDEX) private readonly index: SearchIndex) {}

  async onApplicationBootstrap(): Promise<void> {
    try { this.index.rebuild(await this.repository.listForIndex()); }
    catch { new Logger('InstrumentsIndex').warn('Unable to load persisted instrument search index'); }
  }
}
@Module({ imports: [InstrumentsModule], controllers: [InstrumentsController], exports: [InstrumentsModule] })
export class InstrumentsApiModule {}
