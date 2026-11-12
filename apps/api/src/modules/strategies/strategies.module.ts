import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database';
import { IpRateLimitGuard } from '../../shared/http';
import { AuthModule } from '../auth/auth.module';
import { BACKTEST, ComputeModule } from '../compute/compute.module';
import type { RunBacktest } from '../compute/application/index';
import { IndicatorService } from '../indicators/application/index';
import { IndicatorsModule } from '../indicators/indicators.module';
import { MarketDataService } from '../market-data/application/index';
import { MarketDataModule } from '../market-data/market-data.module';
import { StrategiesController } from './api/strategies.controller';
import { STRATEGIES_RATE_LIMIT, StrategiesRateLimitGuard } from './api/strategies-rate-limit.guard';
import { BacktestRunner } from './application/backtest-runner';
import { Strategies } from './application/strategies';
import { DrizzleStrategyStore } from './infrastructure/drizzle-strategy.store';

@Module({
  imports: [AuthModule, MarketDataModule, IndicatorsModule, ComputeModule],
  controllers: [StrategiesController],
  providers: [
    { provide: STRATEGIES_RATE_LIMIT, useFactory: () => new IpRateLimitGuard(6, 0.1) },
    StrategiesRateLimitGuard,
    { provide: BacktestRunner, inject: [MarketDataService, IndicatorService, BACKTEST],
      useFactory: (market: MarketDataService, indicators: IndicatorService, backtest: RunBacktest | null) =>
        new BacktestRunner({ market, compute: request => indicators.compute(request), backtest }) },
    { provide: Strategies, inject: [DB, BacktestRunner],
      useFactory: (db: Database, runner: BacktestRunner) => new Strategies(new DrizzleStrategyStore(db), runner, { id: randomUUID, now: () => new Date() }) },
  ],
  exports: [BacktestRunner, Strategies],
})
export class StrategiesModule {}
