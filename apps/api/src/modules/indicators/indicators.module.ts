import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { join } from 'node:path';
import { DB, type Database } from '../../shared/database';
import { IpRateLimitGuard } from '../../shared/http';
import { AuthModule } from '../auth/auth.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketDataService, exchangeTimezone } from '../market-data/application/index';
import { IndicatorPresets, IndicatorService, IndicatorTemplates, RuntimeResolver } from './application';
import { IndicatorLibraryController } from './api/indicator-library.controller';
import { IndicatorsController } from './api/indicators.controller';
import { INDICATORS_RATE_LIMIT } from './api/indicators-rate-limit.guard';
import { DrizzlePresetStore, DrizzleTemplateStore } from './infrastructure/drizzle-indicator-library.store';
import { NativeRuntime } from './infrastructure/native/native-runtime';
import { MarketCandleSource } from './infrastructure/pine/market-candle-source';
import { PinePool } from './infrastructure/pine/pine-pool';
import { PineRuntime } from './infrastructure/pine/pine-runtime';

/** The prod box has 2 vCPU and 1.8 GB: two workers at 256 MB, started on first use (E26). */
const PINE_POOL = { workerFile: join(__dirname, 'infrastructure', 'pine', 'pine-worker.js'), size: 2, heapMb: 256, timeoutMs: 5000 };

@Module({
  imports: [MarketDataModule, AuthModule],
  controllers: [IndicatorLibraryController, IndicatorsController],
  providers: [
    { provide: INDICATORS_RATE_LIMIT, useFactory: () => new IpRateLimitGuard(60, 20) },
    { provide: PinePool, useFactory: () => new PinePool(PINE_POOL) },
    { provide: PineRuntime, inject: [PinePool, MarketDataService], useFactory: (pool: PinePool, market: MarketDataService) => new PineRuntime(pool, new MarketCandleSource(market)) },
    { provide: RuntimeResolver, inject: [PineRuntime], useFactory: (pine: PineRuntime) => new RuntimeResolver([new NativeRuntime(), pine]) },
    { provide: IndicatorService, inject: [MarketDataService, RuntimeResolver, PineRuntime],
      useFactory: (market: MarketDataService, runtimes: RuntimeResolver, pine: PineRuntime) => new IndicatorService(market, runtimes, exchangeTimezone, pine) },
    { provide: IndicatorPresets, inject: [DB, IndicatorService],
      useFactory: (db: Database, indicators: IndicatorService) => new IndicatorPresets(new DrizzlePresetStore(db), (id, inputs) => { indicators.checkInputs(id, inputs); }) },
    { provide: IndicatorTemplates, inject: [DB, IndicatorService],
      useFactory: (db: Database, indicators: IndicatorService) => new IndicatorTemplates(new DrizzleTemplateStore(db), (id, inputs) => { indicators.checkInputs(id, inputs); }) },
  ],
  exports: [IndicatorService],
})
export class IndicatorsModule implements OnModuleDestroy {
  constructor(@Inject(PinePool) private readonly pool: PinePool) {}

  onModuleDestroy(): void { this.pool.close(); }
}
