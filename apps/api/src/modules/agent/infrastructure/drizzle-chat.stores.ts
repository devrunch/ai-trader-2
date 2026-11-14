import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { agentMessages, agentThreads, agentTurns } from '../../../shared/database/schema';
import { NotFoundError } from '../../../shared/errors';
import type { ThreadHistoryStore, TurnStart, TurnStore } from '../application/chat-service';
import type { ThreadStore, ThreadSummary } from '../application/threads';

const MAX_MESSAGES = 200;

export class DrizzleTurnStore implements TurnStore {
  constructor(private readonly db: Database) {}
  async start(turn: TurnStart): Promise<void> { await withTimeout(() => this.db.insert(agentTurns).values(turn), 5000); }
  async finish(id: string, result: { outcome: string; tokens: number; finishedAt: string; tools: string[] }): Promise<void> {
    await withTimeout(() => this.db.update(agentTurns).set(result).where(eq(agentTurns.id, id)), 5000);
  }
}

export class DrizzleThreadStore implements ThreadHistoryStore, ThreadStore {
  constructor(private readonly db: Database) {}

  /** Creates the thread on its first turn; a thread id owned by another user is refused, never shared. */
  async ensure(userId: string, threadId: string, firstText: string): Promise<unknown[]> {
    await withTimeout(() => this.db.insert(agentThreads).values({ id: threadId, userId, title: firstText.trim() || 'New chat' }).onConflictDoNothing(), 5000);
    const [row] = await withTimeout(() => this.db.select({ userId: agentThreads.userId }).from(agentThreads).where(eq(agentThreads.id, threadId)), 5000);
    if (row?.userId !== userId) throw new NotFoundError('Chat not found', { threadId });
    return (await this.messages(userId, threadId)) ?? [];
  }

  /** The client sends the whole conversation each turn; the newest MAX_MESSAGES replace what was stored. */
  async saveMessages(userId: string, threadId: string, messages: unknown[]): Promise<void> {
    const kept = messages.slice(-MAX_MESSAGES);
    await withTimeout(() => this.db.transaction(async tx => {
      const owned = await tx.update(agentThreads).set({ updatedAt: sql`now()` }).where(and(eq(agentThreads.id, threadId), eq(agentThreads.userId, userId))).returning({ id: agentThreads.id });
      if (owned.length === 0) return;
      await tx.delete(agentMessages).where(eq(agentMessages.threadId, threadId));
      if (kept.length > 0) await tx.insert(agentMessages).values(kept.map((message, seq) => ({ threadId, seq, message })));
    }), 10_000);
  }

  async list(userId: string): Promise<ThreadSummary[]> {
    const rows = await withTimeout(() => this.db.select().from(agentThreads).where(eq(agentThreads.userId, userId)).orderBy(desc(agentThreads.updatedAt)).limit(100), 5000);
    return rows.map(row => ({ id: row.id, title: row.title, updatedAt: new Date(row.updatedAt).toISOString() }));
  }

  async messages(userId: string, threadId: string): Promise<unknown[] | null> {
    const [owner] = await withTimeout(() => this.db.select({ id: agentThreads.id }).from(agentThreads).where(and(eq(agentThreads.id, threadId), eq(agentThreads.userId, userId))), 5000);
    if (!owner) return null;
    const rows = await withTimeout(() => this.db.select({ message: agentMessages.message }).from(agentMessages).where(eq(agentMessages.threadId, threadId)).orderBy(asc(agentMessages.seq)), 5000);
    return rows.map(row => row.message);
  }

  async rename(userId: string, threadId: string, title: string): Promise<boolean> {
    const rows = await withTimeout(() => this.db.update(agentThreads).set({ title }).where(and(eq(agentThreads.id, threadId), eq(agentThreads.userId, userId))).returning({ id: agentThreads.id }), 5000);
    return rows.length > 0;
  }

  async remove(userId: string, threadId: string): Promise<boolean> {
    const rows = await withTimeout(() => this.db.delete(agentThreads).where(and(eq(agentThreads.id, threadId), eq(agentThreads.userId, userId))).returning({ id: agentThreads.id }), 5000);
    return rows.length > 0;
  }
}
