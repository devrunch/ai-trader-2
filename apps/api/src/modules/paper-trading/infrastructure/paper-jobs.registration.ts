import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { MatchOpenOrders } from '../application/match-open-orders';
import type { SquareOff } from '../application/square-off';

/**
 * Durable paper jobs (NFR-RB-5): one runner at a time across instances, catch-up after a restart. The square-off runs
 * every minute and decides from each position's own square-off time, so special sessions need no extra schedule.
 */
export class PaperJobsRegistration implements OnApplicationBootstrap {
  private readonly logger = new Logger('PaperJobs');
  constructor(private readonly scheduler: Pick<JobScheduler, 'register'>, private readonly match: Pick<MatchOpenOrders, 'execute'>,
    private readonly squareOff: Pick<SquareOff, 'execute'>) {}

  async onApplicationBootstrap(): Promise<void> {
    const tz = 'Asia/Kolkata';
    try {
      await this.scheduler.register({ name: 'paper-match', cron: '*/5 * * * * *', tz, graceMs: 0, maxRuntimeMs: 30_000,
        run: async signal => { await this.match.execute(signal); } });
      await this.scheduler.register({ name: 'paper-square-off', cron: '* * * * *', tz, graceMs: 60_000, maxRuntimeMs: 50_000,
        run: async signal => { await this.squareOff.execute(signal); } });
    } catch (error) {
      this.logger.warn(`paper jobs not scheduled: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }
}
