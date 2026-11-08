import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { withTimeout } from '@aitrader/resilience';
import { eq } from 'drizzle-orm';
import type { Database } from '../../../shared/database/index.js';
import { instruments, instrumentSourceStatus } from '../../../shared/database/schema/index.js';
import type { JobScheduler } from '../../../shared/jobs/index.js';
import type { ReadinessRegistry } from '../../../shared/health/index.js';
import type { RefreshInstruments } from '../application/index.js';

export class RefreshJob implements OnApplicationBootstrap {
  private readonly logger = new Logger('InstrumentsRefresh');
  constructor(private readonly scheduler: Pick<JobScheduler, 'register' | 'runNow'>,
    private readonly refresh: RefreshInstruments, private readonly db: Database, private readonly readiness: ReadinessRegistry) {}

  onApplicationBootstrap(): void {
    for (const source of ['kite', 'deriv', 'nasdaq']) {
      this.readiness.register(`instruments:${source}`, async () => {
        try {
          const [row] = await withTimeout(() => this.db.select().from(instrumentSourceStatus)
            .where(eq(instrumentSourceStatus.source, source)).limit(1), 1500);
          return row?.status === 'ok' ? { status: 'up' } : { status: 'down', reason: row?.reason ?? 'master not refreshed' };
        } catch { return { status: 'down', reason: 'master storage unavailable' }; }
      });
    }
    // Boot stays available when Redis or Postgres is unavailable; the scheduler owns durable deliveries.
    void this.start().catch((error: unknown) => { this.logger.warn(error); });
  }

  private async start(): Promise<void> {
    await this.scheduler.register({ name: 'instruments-refresh', cron: '0 7 * * *', tz: 'Asia/Kolkata',
      graceMs: 6 * 3600000, maxRuntimeMs: 10 * 60000, run: async signal => { await this.refresh.execute(signal); } });
    const rows = await withTimeout(() => this.db.select({ id: instruments.id }).from(instruments).limit(1), 3000);
    if (rows.length === 0) await this.scheduler.runNow('instruments-refresh');
  }
}
