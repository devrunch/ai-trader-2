import { GlobalExceptionFilter } from './shared/errors';
import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule, type AppConfig } from './shared/config';
import { ObservabilityModule } from './shared/observability';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './shared/database';
import { RedisModule } from './shared/redis';
import { KiteModule } from './shared/vendors/kite';
import { JobSchedulerModule } from './shared/jobs';
import { InstrumentsApiModule } from './modules/instruments/instruments.module';
import { MarketDataApiModule } from './modules/market-data/market-data.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminOpsModule } from './modules/admin-ops/admin-ops.module';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      providers: [GlobalExceptionFilter],
      imports: [AppConfigModule.forRoot(config), ObservabilityModule, HealthModule, DatabaseModule, RedisModule, JobSchedulerModule, KiteModule,
        InstrumentsApiModule, MarketDataApiModule, AuthModule, AdminOpsModule],
    };
  }
}
