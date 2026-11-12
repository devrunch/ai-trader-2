import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Database } from '../../../shared/database';
import { agentTrades } from '../../../shared/database/schema';
import type { TradeJournal, TradeRow } from '../application/agent-trader';

const Venue = z.enum(['paper', 'broker']);
const Side = z.enum(['buy', 'sell']);

export class DrizzleTradeJournal implements TradeJournal {
  constructor(private readonly db: Database) {}

  async add(row: TradeRow): Promise<void> {
    await withTimeout(() => this.db.insert(agentTrades).values(row).onConflictDoNothing(), 5000);
  }

  async countSince(taskId: string, since: number): Promise<number> {
    const [row] = await withTimeout(() => this.db.select({ n: sql<number>`count(*)::int` }).from(agentTrades)
      .where(and(eq(agentTrades.taskId, taskId), gte(agentTrades.createdAt, new Date(since).toISOString()))), 5000);
    return row?.n ?? 0;
  }

  async list(userId: string, limit: number): Promise<Array<Omit<TradeRow, 'userId'>>> {
    const rows = await withTimeout(() => this.db.select().from(agentTrades).where(eq(agentTrades.userId, userId)).orderBy(desc(agentTrades.createdAt)).limit(limit), 5000);
    return rows.map(r => ({ id: r.id, createdAt: new Date(r.createdAt).toISOString(), venue: Venue.parse(r.venue), taskId: r.taskId, trigger: r.trigger, skill: r.skill, rationale: r.rationale,
      symbol: r.symbol, side: Side.parse(r.side), quantity: r.quantity, entry: r.entry, stopLoss: r.stopLoss, target: r.target, riskAmount: r.riskAmount, currency: r.currency,
      backtest: r.backtest, clientOrderId: r.clientOrderId }));
  }
}
