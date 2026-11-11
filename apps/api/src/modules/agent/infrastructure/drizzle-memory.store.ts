import { and, asc, eq } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { agentMemory } from '../../../shared/database/schema';
import type { MemoryNote, MemoryStore } from '../application/agent-memory';

export class DrizzleMemoryStore implements MemoryStore {
  constructor(private readonly db: Database) {}

  async list(userId: string): Promise<MemoryNote[]> {
    const rows = await withTimeout(() => this.db.select().from(agentMemory).where(eq(agentMemory.userId, userId)).orderBy(asc(agentMemory.createdAt)), 5000);
    return rows.map(r => ({ id: r.id, note: r.note, createdAt: new Date(r.createdAt).toISOString() }));
  }

  async add(userId: string, note: { id: string; note: string }): Promise<void> {
    await withTimeout(() => this.db.insert(agentMemory).values({ id: note.id, userId, note: note.note }), 5000);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = await withTimeout(() => this.db.delete(agentMemory).where(and(eq(agentMemory.userId, userId), eq(agentMemory.id, id))).returning({ id: agentMemory.id }), 5000);
    return rows.length > 0;
  }
}
