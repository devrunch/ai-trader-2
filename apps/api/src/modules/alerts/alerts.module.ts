import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { JobScheduler } from '../../shared/jobs';
import { AlertGate, NOTIFIER, type Notifier } from '../../shared/notify';
import { KiteModule } from '../../shared/vendors/kite/kite.module';
import { KiteSessionService } from '../../shared/vendors/kite/kite-session.service';
import { AuthModule } from '../auth/auth.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { CheckSessionCoverage, GetFeedOverview } from '../market-data/application/index';
import { AlertsController } from './api/alerts.controller';
import { DailyDataReport, OpsWatch, ZerodhaReminder } from './application/alert-jobs';
import { AlertJobsRegistration } from './infrastructure/alert-jobs.registration';

@Module({
  imports: [AuthModule, KiteModule, MarketDataModule],
  controllers: [AlertsController],
  providers: [
    { provide: ZerodhaReminder, inject: [KiteSessionService, NOTIFIER, AlertGate, APP_CONFIG],
      useFactory: (kite: KiteSessionService, notifier: Notifier, gate: AlertGate, config: AppConfig) => new ZerodhaReminder(kite, notifier, gate, config.APP_URL) },
    { provide: DailyDataReport, inject: [CheckSessionCoverage, NOTIFIER],
      useFactory: (coverage: CheckSessionCoverage, notifier: Notifier) => new DailyDataReport(coverage, notifier) },
    { provide: OpsWatch, inject: [JobScheduler, GetFeedOverview, NOTIFIER, AlertGate],
      useFactory: (jobs: JobScheduler, feeds: GetFeedOverview, notifier: Notifier, gate: AlertGate) => new OpsWatch({
        jobs: { list: () => jobs.list(), lastRun: name => jobs.lastRun(name) },
        feeds: { state: vendor => feeds.state(vendor as 'kite' | 'deriv' | 'us-delayed') }, notifier, gate, clock: Date.now }) },
    { provide: AlertJobsRegistration, inject: [JobScheduler, ZerodhaReminder, DailyDataReport, OpsWatch],
      useFactory: (scheduler: JobScheduler, reminder: ZerodhaReminder, report: DailyDataReport, watch: OpsWatch) => new AlertJobsRegistration(scheduler, reminder, report, watch) },
  ],
})
export class AlertsModule {}
