import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule, type AppConfig } from './shared/config';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './shared/errors';
import { ObservabilityModule } from './shared/observability';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './shared/database';
import { RedisModule } from './shared/redis';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [AppConfigModule.forRoot(config), ObservabilityModule, HealthModule, DatabaseModule, RedisModule],
      providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
    };
  }
}
