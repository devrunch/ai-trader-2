import { and, eq } from 'drizzle-orm';
import { AgentActionSchema, DrawingSchema } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Database } from '../../../shared/database';
import { agentActions } from '../../../shared/database/schema';
import type { ActionCardStore } from '../application/action-cards';
import type { ActionCard } from '../domain/action-card';

const StateSchema = z.enum(['pending', 'applied', 'dismissed', 'expired', 'failed']);

export class DrizzleActionStore implements ActionCardStore {
  constructor(private readonly db: Database) {}

  async create(card: ActionCard): Promise<void> {
    await withTimeout(() => this.db.insert(agentActions).values(row(card)), 5000);
  }

  async get(userId: string, id: string): Promise<ActionCard | null> {
    const [found] = await withTimeout(() => this.db.select().from(agentActions).where(and(eq(agentActions.id, id), eq(agentActions.userId, userId))), 5000);
    if (!found) return null;
    return { id: found.id, userId: found.userId, action: AgentActionSchema.parse(found.action), state: StateSchema.parse(found.state), reason: found.reason,
      drawing: found.drawing === null ? null : DrawingSchema.parse(found.drawing),
      createdAt: Date.parse(found.createdAt), expiresAt: Date.parse(found.expiresAt) };
  }

  /** Compare-and-set on the stored state, so an apply and a dismiss racing each other cannot both win. */
  async save(card: ActionCard, from: ActionCard['state']): Promise<boolean> {
    const rows = await withTimeout(() => this.db.update(agentActions).set({ action: card.action, state: card.state, reason: card.reason, drawing: card.drawing })
      .where(and(eq(agentActions.id, card.id), eq(agentActions.userId, card.userId), eq(agentActions.state, from))).returning({ id: agentActions.id }), 5000);
    return rows.length > 0;
  }
}

const row = (card: ActionCard) => ({ id: card.id, userId: card.userId, action: card.action, state: card.state, reason: card.reason, drawing: card.drawing,
  createdAt: new Date(card.createdAt).toISOString(), expiresAt: new Date(card.expiresAt).toISOString() });
