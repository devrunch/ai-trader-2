import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule, type AppConfig } from '../shared/config/index.js';
import { DatabaseModule } from '../shared/database/index.js';
import { AuthPersistenceModule } from '../modules/auth/auth.module.js';

@Module({})
export class AdminCliModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AdminCliModule,
      imports: [AppConfigModule.forRoot(config), DatabaseModule, AuthPersistenceModule],
    };
  }
}
