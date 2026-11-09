import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { KiteModule } from '../../shared/vendors/kite/kite.module.js';
import { KiteSessionService } from '../../shared/vendors/kite/kite-session.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ZerodhaConnect } from './application/zerodha-connect.js';
import { ZerodhaController } from './api/zerodha.controller.js';
import { OpsController } from './api/ops.controller.js';
import { OpsOverview } from './application/ops-overview.js';
import { JobScheduler } from '../../shared/jobs/index.js';
import { InstrumentsModule } from '../instruments/instruments.module.js';
import { ListInstrumentSources } from '../instruments/application/index.js';
import { MarketDataModule } from '../market-data/market-data.module.js';
import { GetFeedOverview } from '../market-data/application/index.js';

@Module({ imports: [AuthModule, KiteModule, InstrumentsModule, MarketDataModule], controllers: [ZerodhaController, OpsController], providers: [
  { provide: OpsOverview, inject: [GetFeedOverview, JobScheduler, ListInstrumentSources],
    useFactory: (feeds: GetFeedOverview, jobs: JobScheduler, sources: ListInstrumentSources) => new OpsOverview({
      feedStates: { get: vendor => feeds.state(vendor) },
      leadership: { leader: () => feeds.leader(), subscriptions: () => feeds.subscriptions() },
      jobs: { list: () => jobs.list(), lastRun: name => jobs.lastRun(name), has: name => jobs.has(name), runNow: name => jobs.runNow(name) },
      sources: { list: () => sources.execute() },
    }) },
  { provide: ZerodhaConnect, inject: [KiteSessionService, APP_CONFIG], useFactory: (sessions: KiteSessionService, config: AppConfig) =>
    new ZerodhaConnect(sessions, config.ZERODHA_API_KEY, config.KITE_AUTO_LOGIN, config.KITE_REDIRECT_URL) },
] })
export class AdminOpsModule {}
