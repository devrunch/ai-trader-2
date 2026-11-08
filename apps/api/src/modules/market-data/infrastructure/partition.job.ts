import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import type { JobScheduler } from '../../../shared/jobs';
import type { ReadinessRegistry } from '../../../shared/health';

export class PartitionJob implements OnApplicationBootstrap {
  private readonly logger = new Logger('BarsPartitions');
  private ready = false;
  constructor(private readonly db: Database, private readonly scheduler: Pick<JobScheduler, 'register'>,
    private readonly readiness: ReadinessRegistry, private readonly clock: () => Date = () => new Date()) {}

  onApplicationBootstrap(): void {
    this.readiness.register('bars-partitions', () => Promise.resolve(this.ready ? { status: 'up' } : { status: 'down', reason: 'Partitions not initialized' }));
    void this.start().catch((error: unknown) => { this.logger.warn(error); });
  }

  private async start(): Promise<void> {
    await this.scheduler.register({ name: 'bars-partitions', cron: '0 1 1 * *', tz: 'Asia/Kolkata',
      maxRuntimeMs: 30000, graceMs: 31 * 86400000, run: signal => this.run(signal) });
    await this.run();
  }

  async run(signal?: AbortSignal): Promise<void> {
    try {
      const now = new Date(this.clock().getTime() + 19800000);
      for (let offset = 0; offset < 3; offset++) {
        const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
        // The SQL function serializes concurrent DDL and skips existing partitions.
        await withTimeout(async abort => { abort.throwIfAborted(); await this.db.execute(sql`select create_bars_1m_partition(${month}::date)`); }, 5000, signal);
      }
      this.ready = true;
    } catch (error) { this.ready = false; throw error; }
  }
}
