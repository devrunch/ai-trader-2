import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from './shared/config';
import { AppConfigModule } from './shared/config';
import { ObservabilityModule } from './shared/observability';
import { DatabaseModule } from './shared/database';
import { RedisModule } from './shared/redis';
import { HealthModule } from './modules/health/health.module';
import { MarketDataInstrumentsModule } from './modules/instruments/market-data-instruments.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { JobSchedulerModule } from './shared/jobs';
import { SourcesModule } from './shared/sources';
import { GlobalExceptionFilter } from './shared/errors';

@Module({})
export class MarketDataAppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return { module: MarketDataAppModule, providers: [GlobalExceptionFilter],
      imports: [AppConfigModule.forRoot(config), ObservabilityModule, DatabaseModule, RedisModule, SourcesModule, HealthModule, MarketDataInstrumentsModule, MarketDataModule, JobSchedulerModule] };
  }
}
