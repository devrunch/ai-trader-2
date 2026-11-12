import { eq } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { executionPrefs } from '../../../shared/database/schema';
import type { BrokerOptIn } from '../application/execution-venue';

/** The per-user broker opt-in (default off). Only ever read when EXECUTION_MODE=broker outside production. */
export class DrizzleExecutionPrefs implements BrokerOptIn {
  constructor(private readonly db: Database) {}

  async enabled(userId: string): Promise<boolean> {
    const [row] = await withTimeout(() => this.db.select().from(executionPrefs).where(eq(executionPrefs.userId, userId)), 5000);
    return row?.brokerOptIn ?? false;
  }

  async set(userId: string, brokerOptIn: boolean): Promise<void> {
    await withTimeout(() => this.db.insert(executionPrefs).values({ userId, brokerOptIn }).onConflictDoUpdate({ target: executionPrefs.userId, set: { brokerOptIn } }), 5000);
  }
}
