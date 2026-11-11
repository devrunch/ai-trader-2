import { Global, Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database/index.js';
import { InstrumentHistory, ResolveInstrument } from './application/index.js';
import { INSTRUMENT_REPOSITORY, type InstrumentRepository } from './application/ports/instrument-repository.js';
import { DrizzleInstrumentRepository } from './infrastructure/drizzle-instrument.repository.js';
import { POPULAR_INSTRUMENTS } from './infrastructure/popular-instruments';

// Lean instruments for the market-data process: id resolution only, no search index (~100k rows) and no master refresh.
@Global()
@Module({
  providers: [
    { provide: INSTRUMENT_REPOSITORY, inject: [DB], useFactory: (db: Database) => new DrizzleInstrumentRepository(db) },
    { provide: ResolveInstrument, inject: [INSTRUMENT_REPOSITORY],
      useFactory: (repo: InstrumentRepository) => new ResolveInstrument(repo, { suggest: () => [] }) },
    { provide: InstrumentHistory, inject: [INSTRUMENT_REPOSITORY],
      useFactory: (repo: InstrumentRepository) => new InstrumentHistory(repo, POPULAR_INSTRUMENTS) },
  ],
  exports: [ResolveInstrument, InstrumentHistory],
})
export class MarketDataInstrumentsModule {}
