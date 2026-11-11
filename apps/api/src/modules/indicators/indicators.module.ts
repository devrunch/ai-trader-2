import { Module } from '@nestjs/common';
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

@Module({
  imports: [MarketDataModule, AuthModule],
  controllers: [IndicatorLibraryController, IndicatorsController],
  providers: [
    { provide: INDICATORS_RATE_LIMIT, useFactory: () => new IpRateLimitGuard(60, 20) },
    { provide: RuntimeResolver, useFactory: () => new RuntimeResolver([new NativeRuntime()]) },
    { provide: IndicatorService, inject: [MarketDataService, RuntimeResolver],
      useFactory: (market: MarketDataService, runtimes: RuntimeResolver) => new IndicatorService(market, runtimes, exchangeTimezone) },
    { provide: IndicatorPresets, inject: [DB, IndicatorService],
      useFactory: (db: Database, indicators: IndicatorService) => new IndicatorPresets(new DrizzlePresetStore(db), (id, inputs) => { indicators.checkInputs(id, inputs); }) },
    { provide: IndicatorTemplates, inject: [DB, IndicatorService],
      useFactory: (db: Database, indicators: IndicatorService) => new IndicatorTemplates(new DrizzleTemplateStore(db), (id, inputs) => { indicators.checkInputs(id, inputs); }) },
  ],
  exports: [IndicatorService],
})
export class IndicatorsModule {}
