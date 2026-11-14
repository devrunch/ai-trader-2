import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { userEmailPrefs } from '../../../shared/database/schema';
import type { EmailPrefStore } from '../application/email-reports';

const Email = z.email();

export class DrizzleEmailPrefStore implements EmailPrefStore {
  constructor(private readonly db: Database) {}

  async reports(userId: string): Promise<boolean> {
    const [row] = await withTimeout(() => this.db.select({ reports: userEmailPrefs.reports }).from(userEmailPrefs).where(eq(userEmailPrefs.userId, userId)), 5000);
    return row?.reports ?? false;
  }

  async setReports(userId: string, on: boolean, address?: string): Promise<void> {
    const set = address === undefined ? { reports: on, updatedAt: sql`now()` } : { reports: on, address, updatedAt: sql`now()` };
    await withTimeout(() => this.db.insert(userEmailPrefs).values({ userId, reports: on, ...(address === undefined ? {} : { address }) })
      .onConflictDoUpdate({ target: userEmailPrefs.userId, set }), 5000);
  }

  async address(userId: string): Promise<string | null> {
    const [row] = await withTimeout(() => this.db.select({ address: userEmailPrefs.address }).from(userEmailPrefs).where(eq(userEmailPrefs.userId, userId)), 5000);
    const parsed = Email.safeParse(row?.address);
    return parsed.success ? parsed.data : null;
  }
}
