import { Module } from '@nestjs/common';
import { IpRateLimitGuard } from '../../shared/http';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketDataService, exchangeTimezone } from '../market-data/application/index';
import { IndicatorService, RuntimeResolver } from './application';
import { IndicatorsController } from './api/indicators.controller';
import { INDICATORS_RATE_LIMIT } from './api/indicators-rate-limit.guard';
import { NativeRuntime } from './infrastructure/native/native-runtime';

@Module({
  imports: [MarketDataModule],
  controllers: [IndicatorsController],
  providers: [
    { provide: INDICATORS_RATE_LIMIT, useFactory: () => new IpRateLimitGuard(60, 20) },
    { provide: RuntimeResolver, useFactory: () => new RuntimeResolver([new NativeRuntime()]) },
    { provide: IndicatorService, inject: [MarketDataService, RuntimeResolver],
      useFactory: (market: MarketDataService, runtimes: RuntimeResolver) => new IndicatorService(market, runtimes, exchangeTimezone) },
  ],
  exports: [IndicatorService],
})
export class IndicatorsModule {}
