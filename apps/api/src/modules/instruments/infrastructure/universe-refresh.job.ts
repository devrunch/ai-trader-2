import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs/index.js';
import type { Universes } from '../application/universes.js';

/** Weekly (Monday 06:30 IST) refetch of the NSE index constituent lists. Writing the same list twice is harmless (one row per index). */
export class UniverseRefreshJob implements OnApplicationBootstrap {
  private readonly logger = new Logger('UniverseRefresh');
  constructor(private readonly scheduler: Pick<JobScheduler, 'register'>, private readonly universes: Universes) {}

  onApplicationBootstrap(): void {
    void this.scheduler.register({ name: 'universes-refresh', cron: '30 6 * * 1', tz: 'Asia/Kolkata', graceMs: 24 * 3600000, maxRuntimeMs: 5 * 60000,
      run: async signal => { await this.universes.refresh(signal); } }).catch((error: unknown) => { this.logger.warn(error); });
  }
}
