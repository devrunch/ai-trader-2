import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import type { JobScheduler } from '../../../shared/jobs';

export class RetentionJob implements OnApplicationBootstrap {
  private readonly logger = new Logger('BarsRetention');
  constructor(private readonly db: Database, private readonly clock: () => Date = () => new Date(),
    private readonly scheduler?: Pick<JobScheduler, 'register'>) {}

  onApplicationBootstrap(): void {
    void this.scheduler?.register({ name: 'bars-retention', cron: '0 2 * * *', tz: 'Asia/Kolkata',
      maxRuntimeMs: 30000, graceMs: 86400000, run: signal => this.run(signal) })
      .catch((error: unknown) => { this.logger.warn(error); });
  }

  async run(signal?: AbortSignal): Promise<void> {
    const now = new Date(this.clock().getTime() + 19800000);
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 24, 1)).toISOString().slice(0, 7).replace('-', '');
    await withTimeout(async abort => {
      abort.throwIfAborted();
      await this.db.transaction(async tx => {
        await tx.execute(sql`set local statement_timeout = '5s'`);
        await tx.execute(sql`set local transaction_timeout = '25s'`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('bars_1m_partitions'))`);
        const result = await tx.execute(sql`select child.relname as name from pg_inherits
          join pg_class parent on parent.oid = inhparent join pg_class child on child.oid = inhrelid
          where parent.oid = 'bars_1m'::regclass`);
        const partitions = z.array(z.object({ name: z.string().regex(/^bars_1m_\d{6}$/) })).parse(result.rows);
        for (const { name } of partitions) {
          abort.throwIfAborted();
          // Names come only from attached partitions, validated before identifier quoting; replay is safe.
          if (name.slice(-6) < cutoff) await tx.execute(sql`drop table if exists ${sql.identifier(name)}`);
        }
      });
    }, 30000, signal);
  }
}
