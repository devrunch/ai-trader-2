import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule, type AppConfig } from './shared/config';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return { module: AppModule, imports: [AppConfigModule.forRoot(config)] };
  }
}
