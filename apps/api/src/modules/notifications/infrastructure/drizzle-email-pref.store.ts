import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { userEmailPrefs, users } from '../../../shared/database/schema';
import type { EmailPrefStore } from '../application/email-reports';

const Email = z.email();

export class DrizzleEmailPrefStore implements EmailPrefStore {
  constructor(private readonly db: Database) {}

  async reports(userId: string): Promise<boolean> {
    const [row] = await withTimeout(() => this.db.select({ reports: userEmailPrefs.reports }).from(userEmailPrefs).where(eq(userEmailPrefs.userId, userId)), 5000);
    return row?.reports ?? false;
  }

  async setReports(userId: string, on: boolean): Promise<void> {
    await withTimeout(() => this.db.insert(userEmailPrefs).values({ userId, reports: on })
      .onConflictDoUpdate({ target: userEmailPrefs.userId, set: { reports: on, updatedAt: sql`now()` } }), 5000);
  }

  async address(userId: string): Promise<string | null> {
    const [row] = await withTimeout(() => this.db.select({ username: users.username }).from(users).where(eq(users.id, userId)), 5000);
    const parsed = Email.safeParse(row?.username);
    return parsed.success ? parsed.data : null;
  }
}
