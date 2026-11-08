import { Logger, Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database/index.js';
import { JobScheduler } from '../../shared/jobs/index.js';
import { ReadinessRegistry } from '../../shared/health/index.js';
import { RefreshInstruments, ResolveInstrument } from './application/index.js';
import { INSTRUMENT_REPOSITORY, type InstrumentRepository } from './application/ports/instrument-repository.js';
import { INSTRUMENT_SOURCES, type InstrumentSource } from './application/ports/instrument-source.js';
import { SEARCH_INDEX, type SearchIndex } from './application/ports/search-index.js';
import { DrizzleInstrumentRepository } from './infrastructure/drizzle-instrument.repository.js';
import { RefreshJob } from './infrastructure/refresh.job.js';
import { DerivSource, KiteSource, NasdaqSource } from './infrastructure/sources/index.js';

@Module({
  providers: [
    { provide: INSTRUMENT_REPOSITORY, inject: [DB], useFactory: (db: Database) => new DrizzleInstrumentRepository(db) },
    { provide: INSTRUMENT_SOURCES, useFactory: (): InstrumentSource[] => [new KiteSource(), new DerivSource(), new NasdaqSource()] },
    // P1-6 supplies the search implementation; persistence can run before that feature exists.
    { provide: SEARCH_INDEX, useValue: { rebuild: () => {}, suggest: () => [] } satisfies SearchIndex },
    { provide: RefreshInstruments, inject: [INSTRUMENT_REPOSITORY, INSTRUMENT_SOURCES, SEARCH_INDEX],
      useFactory: (repo: InstrumentRepository, sources: InstrumentSource[], index: SearchIndex) =>
        new RefreshInstruments(repo, sources, index, () => new Date(), new Logger('RefreshInstruments')) },
    { provide: ResolveInstrument, inject: [INSTRUMENT_REPOSITORY, SEARCH_INDEX],
      useFactory: (repo: InstrumentRepository, index: SearchIndex) => new ResolveInstrument(repo, index) },
    { provide: RefreshJob, inject: [JobScheduler, RefreshInstruments, DB, ReadinessRegistry],
      useFactory: (scheduler: JobScheduler, refresh: RefreshInstruments, db: Database, readiness: ReadinessRegistry) =>
        new RefreshJob(scheduler, refresh, db, readiness) },
  ],
  exports: [RefreshInstruments, ResolveInstrument],
})
export class InstrumentsModule {}
