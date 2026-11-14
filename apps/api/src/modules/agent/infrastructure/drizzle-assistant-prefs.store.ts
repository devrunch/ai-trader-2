import { eq, sql } from 'drizzle-orm';
import { AssistantPrefsSchema, type AssistantPrefs } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { assistantPrefs } from '../../../shared/database/schema';
import type { PrefsStore } from '../application/assistant-prefs';

export class DrizzleAssistantPrefsStore implements PrefsStore {
  constructor(private readonly db: Database) {}

  async get(userId: string): Promise<AssistantPrefs | null> {
    const [row] = await withTimeout(() => this.db.select().from(assistantPrefs).where(eq(assistantPrefs.userId, userId)), 5000);
    return row ? AssistantPrefsSchema.parse({ mode: row.mode, maxRiskPct: row.maxRiskPct, maxTradesPerDay: row.maxTradesPerDay }) : null;
  }

  async set(userId: string, prefs: AssistantPrefs): Promise<void> {
    await withTimeout(() => this.db.insert(assistantPrefs).values({ userId, ...prefs })
      .onConflictDoUpdate({ target: assistantPrefs.userId, set: { ...prefs, updatedAt: sql`now()` } }), 5000);
  }
}
