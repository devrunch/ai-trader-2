import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from './app-config';

export const APP_CONFIG = Symbol('APP_CONFIG');

@Module({})
export class AppConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppConfigModule,
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
