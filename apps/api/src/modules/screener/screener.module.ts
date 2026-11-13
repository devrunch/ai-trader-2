import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { DB, type Database } from '../../shared/database';
import { IpRateLimitGuard } from '../../shared/http';
import { REDIS } from '../../shared/redis/index';
import { AuthModule } from '../auth/auth.module';
import { FundamentalsModule } from '../fundamentals/fundamentals.module';
import { FundamentalsService } from '../fundamentals/application/index';
import { IndicatorService } from '../indicators/application/index';
import { IndicatorsModule } from '../indicators/indicators.module';
import { Universes } from '../instruments/application/index';
import { UniversesModule } from '../instruments/universes.module';
import { StoredBars } from '../market-data/application/index';
import { MarketDataModule } from '../market-data/market-data.module';
import { ScreenerController } from './api/screener.controller';
import { SCREENER_RATE_LIMIT, ScreenerRateLimitGuard } from './api/screener-rate-limit.guard';
import { SavedScreens } from './application/saved-screens';
import { ScanService } from './application/scan';
import type { FundamentalsPort, IndicatorPort, StoredBarsPort, UniversePort } from './application/ports';
import { DrizzleScreenStore } from './infrastructure/drizzle-screen.store';
import { RedisResultCache } from './infrastructure/redis-result-cache';
import { SCREENER_BARS, SCREENER_FUNDAMENTALS, SCREENER_INDICATORS, SCREENER_UNIVERSES } from './screener.tokens';

/** The four ports are other modules' application APIs, adapted here: universes, stored bars (no vendor calls), indicators on supplied bars, cached fundamentals. */
@Module({
  imports: [AuthModule, UniversesModule, MarketDataModule, IndicatorsModule, FundamentalsModule],
  controllers: [ScreenerController],
  providers: [
    { provide: SCREENER_RATE_LIMIT, useFactory: () => new IpRateLimitGuard(6, 0.2) },
    ScreenerRateLimitGuard,
    { provide: SCREENER_UNIVERSES, inject: [Universes], useFactory: (universes: Universes): UniversePort => ({ list: () => universes.list(), members: async (id, userId) => (await universes.members(id, userId)).map(m => ({ symbol: m.symbol, name: m.name ?? null })) }) },
    { provide: SCREENER_BARS, inject: [StoredBars], useFactory: (bars: StoredBars): StoredBarsPort => ({ latest: (symbols, interval, limit) => bars.latest(symbols, interval, limit) }) },
    { provide: SCREENER_INDICATORS, inject: [IndicatorService], useFactory: (indicators: IndicatorService): IndicatorPort => ({ computeOnBars: (spec, bars) => indicators.computeOnBars(spec, bars) }) },
    { provide: SCREENER_FUNDAMENTALS, inject: [FundamentalsService], useFactory: (fundamentals: FundamentalsService): FundamentalsPort => ({
      getMany: async symbols => {
        const { found } = await fundamentals.getMany(symbols);
        return new Map(found.map(f => [f.symbol, f.ratios]));
      } }) },
    { provide: ScanService, inject: [SCREENER_UNIVERSES, SCREENER_BARS, SCREENER_INDICATORS, SCREENER_FUNDAMENTALS, REDIS],
      useFactory: (universes: UniversePort, bars: StoredBarsPort, indicators: IndicatorPort, fundamentals: FundamentalsPort, redis: Redis) =>
        new ScanService({ universes, bars, indicators, fundamentals, cache: new RedisResultCache(redis) }) },
    { provide: SavedScreens, inject: [DB],
      useFactory: (db: Database) => new SavedScreens(new DrizzleScreenStore(db), { id: randomUUID, now: () => new Date() }) },
  ],
  exports: [ScanService, SavedScreens],
})
export class ScreenerModule {}
