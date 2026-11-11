import { Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database';
import { AuthModule } from '../auth/auth.module';
import { InstrumentId, ResolveInstrument, SearchInstruments } from '../instruments/application/index';
import { InstrumentsModule } from '../instruments/instruments.module';
import { WatchlistsController } from './api/watchlists.controller';
import { Watchlists } from './application/index';
import { DrizzleWatchlistStore } from './infrastructure/drizzle-watchlist.store';

@Module({
  imports: [AuthModule, InstrumentsModule],
  controllers: [WatchlistsController],
  providers: [
    { provide: Watchlists, inject: [DB, SearchInstruments, ResolveInstrument],
      useFactory: (db: Database, search: SearchInstruments, resolve: ResolveInstrument) => new Watchlists(new DrizzleWatchlistStore(db), {
        defaults: () => search.execute('').results.map(r => r.id),
        // Continuous contracts stay continuous (GOLD1!, not this month's future); renamed symbols move to the new name.
        canonical: async symbol => {
          const resolved = await resolve.execute(symbol);
          return resolved.via === 'continuous' ? InstrumentId.parse(symbol).toString() : resolved.instrument.id.toString();
        },
      }) },
  ],
  exports: [Watchlists],
})
export class WatchlistsModule {}
