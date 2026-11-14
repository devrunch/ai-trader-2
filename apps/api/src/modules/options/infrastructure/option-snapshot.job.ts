import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { OptionsService } from '../application/options';
import type { OptionSnapshotStore } from '../application/ports/options-ports';

const logger = new Logger('Options');
const DAY_MS = 86_400_000;
/** Always kept, so a first-time read of an index still has yesterday's baseline. */
const INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];

/** Snapshots the chains read in the last week plus the main indices after the close (15:40 IST), the baseline for tomorrow's open-interest change; repeat runs are no-ops (primary key). */
export class OptionSnapshotJob implements OnModuleInit {
  constructor(private readonly scheduler: JobScheduler, private readonly options: OptionsService, private readonly store: OptionSnapshotStore, private readonly now: () => number = Date.now) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.register({ name: 'option-snapshots', cron: '40 15 * * 1-5', tz: 'Asia/Kolkata', graceMs: 3_600_000, maxRuntimeMs: 20 * 60_000,
      run: async signal => {
        const underlyings = [...new Set([...INDICES, ...await this.store.recentUnderlyings(this.now() - 7 * DAY_MS)])];
        let expiries = 0;
        for (const underlying of underlyings) {
          try { expiries += await this.options.capture(underlying, signal); }
          catch (error) { logger.warn({ message: 'option snapshot failed', underlying, error: error instanceof Error ? error.message : String(error) }); }
        }
        const purged = await this.store.purge(this.now() - 10 * DAY_MS);
        logger.log({ message: 'option snapshots taken', underlyings: underlyings.length, expiries, purged });
      } });
  }
}
