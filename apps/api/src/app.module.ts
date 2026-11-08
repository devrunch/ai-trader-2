import { GlobalExceptionFilter } from './shared/errors';
import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule, type AppConfig } from './shared/config';
import { ObservabilityModule } from './shared/observability';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './shared/database';
import { RedisModule } from './shared/redis';
import { JobSchedulerModule } from './shared/jobs';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      providers: [GlobalExceptionFilter],
      imports: [AppConfigModule.forRoot(config), ObservabilityModule, HealthModule, DatabaseModule, RedisModule, JobSchedulerModule],
    };
  }
}
