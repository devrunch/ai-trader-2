import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { DailyDataReport, OpsWatch, ZerodhaReminder } from '../application/alert-jobs';

/** Schedules the email alerts (IST). Times: reminder before the 09:15 open; report after the 15:40 derivatives close. */
export class AlertJobsRegistration implements OnApplicationBootstrap {
  private readonly logger = new Logger('AlertJobs');
  constructor(private readonly scheduler: Pick<JobScheduler, 'register'>, private readonly reminder: ZerodhaReminder,
    private readonly report: DailyDataReport, private readonly watch: OpsWatch) {}

  async onApplicationBootstrap(): Promise<void> {
    const tz = 'Asia/Kolkata';
    try {
      await this.scheduler.register({ name: 'zerodha-reminder', cron: '45 8 * * *', tz, graceMs: 20 * 60_000, maxRuntimeMs: 60_000, run: () => this.reminder.run() });
      await this.scheduler.register({ name: 'data-report', cron: '50 15 * * *', tz, graceMs: 3 * 3_600_000, maxRuntimeMs: 600_000, run: signal => this.report.run(signal) });
      await this.scheduler.register({ name: 'ops-watch', cron: '*/5 * * * *', tz, graceMs: 0, maxRuntimeMs: 120_000, run: () => this.watch.run() });
    } catch (error) {
      this.logger.warn(`alert jobs not scheduled: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }
}
