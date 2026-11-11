import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { NotificationLinkSchema, type NotificationDto } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Database } from '../../../shared/database';
import { notifications } from '../../../shared/database/schema';
import type { NewNotification, NotificationStore } from '../application/notifications';

const Kind = z.enum(['task', 'fill', 'system']);

export class DrizzleNotificationStore implements NotificationStore {
  constructor(private readonly db: Database) {}

  async insert(row: NewNotification & { id: string }): Promise<void> {
    await withTimeout(() => this.db.insert(notifications).values({ id: row.id, userId: row.userId, kind: row.kind, title: row.title, body: row.body ?? null, link: row.link ?? null }), 5000);
  }

  async list(userId: string, limit: number): Promise<NotificationDto[]> {
    const rows = await withTimeout(() => this.db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit), 5000);
    return rows.map(r => ({ id: r.id, kind: Kind.parse(r.kind), title: r.title, body: r.body, link: r.link === null ? null : NotificationLinkSchema.parse(r.link),
      createdAt: new Date(r.createdAt).toISOString(), read: r.readAt !== null }));
  }

  async unread(userId: string): Promise<number> {
    const [row] = await withTimeout(() => this.db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt))), 5000);
    return row?.n ?? 0;
  }

  async markRead(userId: string, ids: string[] | null): Promise<void> {
    const mine = and(eq(notifications.userId, userId), isNull(notifications.readAt));
    await withTimeout(() => this.db.update(notifications).set({ readAt: new Date().toISOString() })
      .where(ids === null ? mine : and(mine, inArray(notifications.id, ids))), 5000);
  }
}
