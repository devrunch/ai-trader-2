import { and, asc, eq, sql } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import { AgentProfileSchema, type AgentProfile, type LearnedItem } from '@aitrader/contracts';
import type { Database } from '../../../shared/database';
import { agentProfile, agentSignals, agentTurns } from '../../../shared/database/schema';
import type { ProfileStore, SignalInput, SignalStore } from '../application/agent-profile';

export class DrizzleProfileStore implements ProfileStore {
  constructor(private readonly db: Database) {}

  async get(userId: string): Promise<AgentProfile> {
    const [row] = await withTimeout(() => this.db.select().from(agentProfile).where(eq(agentProfile.userId, userId)), 5000);
    const parsed = AgentProfileSchema.safeParse(row?.data ?? {});
    return parsed.success ? parsed.data : {};
  }

  async set(userId: string, profile: AgentProfile): Promise<void> {
    await withTimeout(() => this.db.insert(agentProfile).values({ userId, data: profile })
      .onConflictDoUpdate({ target: agentProfile.userId, set: { data: profile, updatedAt: sql`now()` } }), 5000);
  }
}

export class DrizzleSignalStore implements SignalStore {
  constructor(private readonly db: Database) {}

  async record(userId: string, id: string, signal: SignalInput): Promise<boolean> {
    const rows = await withTimeout(() => this.db.insert(agentSignals).values({ id, userId, ...signal }).onConflictDoNothing().returning({ id: agentSignals.id }), 5000);
    return rows.length > 0;
  }

  async list(userId: string): Promise<LearnedItem[]> {
    const rows = await withTimeout(() => this.db.select().from(agentSignals).where(eq(agentSignals.userId, userId)).orderBy(asc(agentSignals.createdAt), asc(agentSignals.id)), 5000);
    return rows.map(r => ({ id: r.id, kind: r.kind, topic: r.topic, tools: r.tools, createdAt: new Date(r.createdAt).toISOString() }));
  }

  async remove(userId: string, id: string | null): Promise<number> {
    const where = id === null ? eq(agentSignals.userId, userId) : and(eq(agentSignals.userId, userId), eq(agentSignals.id, id));
    return (await withTimeout(() => this.db.delete(agentSignals).where(where).returning({ id: agentSignals.id }), 5000)).length;
  }

  async turnTools(userId: string, threadId: string, index: number): Promise<string[] | null> {
    const rows = await withTimeout(() => this.db.select({ tools: agentTurns.tools }).from(agentTurns)
      .where(and(eq(agentTurns.userId, userId), eq(agentTurns.threadId, threadId))).orderBy(asc(agentTurns.startedAt), asc(agentTurns.id)).limit(1).offset(index), 5000);
    return rows[0]?.tools ?? null;
  }
}
