import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { join } from 'node:path';
import { IpRateLimitGuard } from '../../shared/http';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketDataService, exchangeTimezone } from '../market-data/application/index';
import { IndicatorService, RuntimeResolver } from './application';
import { IndicatorsController } from './api/indicators.controller';
import { INDICATORS_RATE_LIMIT } from './api/indicators-rate-limit.guard';
import { NativeRuntime } from './infrastructure/native/native-runtime';
import { MarketCandleSource } from './infrastructure/pine/market-candle-source';
import { PinePool } from './infrastructure/pine/pine-pool';
import { PineRuntime } from './infrastructure/pine/pine-runtime';

/** The prod box has 2 vCPU and 1.8 GB: two workers at 256 MB, started on first use (E26). */
const PINE_POOL = { workerFile: join(__dirname, 'infrastructure', 'pine', 'pine-worker.js'), size: 2, heapMb: 256, timeoutMs: 5000 };

@Module({
  imports: [MarketDataModule],
  controllers: [IndicatorsController],
  providers: [
    { provide: INDICATORS_RATE_LIMIT, useFactory: () => new IpRateLimitGuard(60, 20) },
    { provide: PinePool, useFactory: () => new PinePool(PINE_POOL) },
    { provide: PineRuntime, inject: [PinePool, MarketDataService], useFactory: (pool: PinePool, market: MarketDataService) => new PineRuntime(pool, new MarketCandleSource(market)) },
    { provide: RuntimeResolver, inject: [PineRuntime], useFactory: (pine: PineRuntime) => new RuntimeResolver([new NativeRuntime(), pine]) },
    { provide: IndicatorService, inject: [MarketDataService, RuntimeResolver, PineRuntime],
      useFactory: (market: MarketDataService, runtimes: RuntimeResolver, pine: PineRuntime) => new IndicatorService(market, runtimes, exchangeTimezone, pine) },
  ],
  exports: [IndicatorService],
})
export class IndicatorsModule implements OnModuleDestroy {
  constructor(@Inject(PinePool) private readonly pool: PinePool) {}

  onModuleDestroy(): void { this.pool.close(); }
}
