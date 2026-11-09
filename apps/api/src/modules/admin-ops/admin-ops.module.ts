import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { KiteModule } from '../../shared/vendors/kite/kite.module.js';
import { KiteSessionService } from '../../shared/vendors/kite/kite-session.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ZerodhaConnect } from './application/zerodha-connect.js';
import { ZerodhaController } from './api/zerodha.controller.js';

@Module({ imports: [AuthModule, KiteModule], controllers: [ZerodhaController], providers: [
  { provide: ZerodhaConnect, inject: [KiteSessionService, APP_CONFIG], useFactory: (sessions: KiteSessionService, config: AppConfig) =>
    new ZerodhaConnect(sessions, config.ZERODHA_API_KEY, config.KITE_AUTO_LOGIN, config.KITE_REDIRECT_URL) },
] })
export class AdminOpsModule {}
