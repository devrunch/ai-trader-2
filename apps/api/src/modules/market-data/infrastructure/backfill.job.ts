import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { retry, sleep } from '@aitrader/resilience';
import type { JobScheduler } from '../../../shared/jobs';
import type { BackfillHeld } from '../application/backfill-held';

export class BackfillJob implements OnApplicationBootstrap {
  private readonly logger = new Logger('BarsBackfill');
  constructor(private readonly scheduler: Pick<JobScheduler, 'register'>, private readonly backfill: Pick<BackfillHeld, 'execute'>) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.scheduler.register({ name: 'bars-backfill', cron: '30 0 * * *', tz: 'Asia/Kolkata',
        graceMs: 6 * 3600000, maxRuntimeMs: 45 * 60000,
        // Composite candle keys make repeated job deliveries and delayed retries idempotent.
        run: signal => retry(async attempt => {
          if (attempt > 0) await sleep(1000, signal);
          const results = await this.backfill.execute(signal);
          if (Object.values(results).some(result => !result.ok && result.reason === 'RATE_LIMITED')) {
            throw new Error('History rate limited; queued for retry');
          }
        }, { retries: 2, baseMs: 1000, maxMs: 10000, signal,
          onRetry: () => { this.logger.warn('History backfill rate limited; waiting to retry'); } }),
      });
    } catch { this.logger.warn('Unable to register bars-backfill'); }
  }
}
