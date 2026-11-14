import { desc, sql } from 'drizzle-orm';
import type { DataGapDto } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { agentDataGaps } from '../../../shared/database/schema';
import type { GapStore } from '../application/data-gaps';

export class DrizzleDataGapsStore implements GapStore {
  constructor(private readonly db: Database) {}

  async record(gap: { tool: string; subject: string; reason: string; example: string | null }): Promise<void> {
    await withTimeout(() => this.db.insert(agentDataGaps).values(gap)
      .onConflictDoUpdate({ target: [agentDataGaps.tool, agentDataGaps.subject, agentDataGaps.reason], set: { count: sql`${agentDataGaps.count} + 1`, lastSeen: sql`now()` } }), 5000);
  }

  async list(limit: number): Promise<DataGapDto[]> {
    const rows = await withTimeout(() => this.db.select().from(agentDataGaps).orderBy(desc(agentDataGaps.lastSeen)).limit(limit), 5000);
    return rows.map(r => ({ tool: r.tool, subject: r.subject, reason: r.reason, count: r.count, example: r.example,
      firstSeen: new Date(r.firstSeen).toISOString(), lastSeen: new Date(r.lastSeen).toISOString() }));
  }
}
