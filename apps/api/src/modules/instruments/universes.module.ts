import { Logger, Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database/index.js';
import { JobScheduler } from '../../shared/jobs/index.js';
import { SourceClient, SourceRegistry } from '../../shared/sources/index.js';
import { Watchlists } from '../watchlists/application/index.js';
import { WatchlistsModule } from '../watchlists/watchlists.module.js';
import { Universes } from './application/universes.js';
import { DrizzleUniverseStore } from './infrastructure/drizzle-universe.store.js';
import { NIFTY50_FALLBACK, NIFTY50_FALLBACK_DATE } from './infrastructure/nifty50-fallback.js';
import { NSE_INDICES_DESCRIPTOR, NseIndicesSource } from './infrastructure/sources/nse-indices.source.js';
import { UniverseRefreshJob } from './infrastructure/universe-refresh.job.js';

const logger = new Logger('Universes');

/** Universes need the watchlists module, which already depends on instruments, so they live in their own module to keep the imports one-way. */
@Module({
  imports: [WatchlistsModule],
  providers: [
    { provide: Universes, inject: [DB, SourceRegistry, SourceClient, Watchlists], useFactory: (db: Database, registry: SourceRegistry, client: SourceClient, watchlists: Watchlists) => {
      registry.register(NSE_INDICES_DESCRIPTOR);
      return new Universes({ store: new DrizzleUniverseStore(db), fetcher: new NseIndicesSource(client), watchlists,
        fallback: { index: 'nifty50', date: NIFTY50_FALLBACK_DATE, ids: NIFTY50_FALLBACK }, warn: (message, detail) => { logger.warn({ message, ...detail }); } });
    } },
    { provide: UniverseRefreshJob, inject: [JobScheduler, Universes], useFactory: (scheduler: JobScheduler, universes: Universes) => new UniverseRefreshJob(scheduler, universes) },
  ],
  exports: [Universes],
})
export class UniversesModule {}
