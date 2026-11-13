import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { DeskBacktestRequestSchema, DeskDecisionSchema, DeskScoreSummarySchema, DeskScoredSchema, DeskTrailSchema, type DeskRunDto } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Database } from '../../../shared/database';
import { deskBacktests, deskRuns } from '../../../shared/database/schema';
import type { DeskBacktestStore, StoredBacktest } from '../application/desk-backtest';
import type { DeskRunStore } from '../application/trading-desk';

const Status = z.enum(['running', 'done', 'budget', 'error']);
type RunRow = typeof deskRuns.$inferSelect;
const toRun = (r: RunRow): DeskRunDto => ({ id: r.id, symbol: r.symbol, asOf: new Date(r.asOf).toISOString(), live: r.live, createdAt: new Date(r.createdAt).toISOString(),
  status: Status.parse(r.status), decision: DeskDecisionSchema.parse(r.decision), trail: DeskTrailSchema.parse(r.trail), tokens: r.tokens, calls: r.calls, error: r.error });

export class DrizzleDeskRunStore implements DeskRunStore {
  constructor(private readonly db: Database) {}

  async insert(userId: string, run: DeskRunDto): Promise<void> {
    await withTimeout(() => this.db.insert(deskRuns).values({ id: run.id, userId, symbol: run.symbol, asOf: run.asOf, live: run.live, createdAt: run.createdAt, status: run.status,
      decision: run.decision, trail: run.trail, tokens: run.tokens, calls: run.calls, error: run.error }), 5000);
  }

  async update(userId: string, run: DeskRunDto): Promise<void> {
    await withTimeout(() => this.db.update(deskRuns).set({ status: run.status, decision: run.decision, trail: run.trail, tokens: run.tokens, calls: run.calls, error: run.error })
      .where(and(eq(deskRuns.userId, userId), eq(deskRuns.id, run.id))), 5000);
  }

  async list(userId: string, query: { symbol?: string | undefined; limit: number }): Promise<DeskRunDto[]> {
    const where = query.symbol ? and(eq(deskRuns.userId, userId), eq(deskRuns.symbol, query.symbol)) : eq(deskRuns.userId, userId);
    return (await withTimeout(() => this.db.select().from(deskRuns).where(where).orderBy(desc(deskRuns.createdAt)).limit(query.limit), 5000)).map(toRun);
  }

  async get(userId: string, id: string): Promise<DeskRunDto | null> {
    const [row] = await withTimeout(() => this.db.select().from(deskRuns).where(and(eq(deskRuns.userId, userId), eq(deskRuns.id, id))), 5000);
    return row ? toRun(row) : null;
  }

  async countSince(userId: string, since: number): Promise<number> {
    const [row] = await withTimeout(() => this.db.select({ n: sql<number>`count(*)::int` }).from(deskRuns)
      .where(and(eq(deskRuns.userId, userId), gte(deskRuns.createdAt, new Date(since).toISOString()))), 5000);
    return row?.n ?? 0;
  }
}

const Items = z.array(DeskScoredSchema);
const toBacktest = (r: typeof deskBacktests.$inferSelect): StoredBacktest => ({ id: r.id, userId: r.userId, symbol: r.symbol, request: DeskBacktestRequestSchema.parse(r.request),
  status: z.enum(['running', 'done', 'failed']).parse(r.status), done: r.done, total: r.total, items: Items.parse(r.items), summary: r.summary === null ? null : DeskScoreSummarySchema.parse(r.summary),
  tokens: r.tokens, createdAt: new Date(r.createdAt).toISOString(), finishedAt: r.finishedAt === null ? null : new Date(r.finishedAt).toISOString(), error: r.error });

export class DrizzleDeskBacktestStore implements DeskBacktestStore {
  constructor(private readonly db: Database) {}

  async insert(row: StoredBacktest): Promise<void> {
    await withTimeout(() => this.db.insert(deskBacktests).values({ id: row.id, userId: row.userId, symbol: row.symbol, request: row.request, status: row.status, done: row.done, total: row.total,
      items: row.items, summary: row.summary, tokens: row.tokens, createdAt: row.createdAt, finishedAt: row.finishedAt, error: row.error }), 5000);
  }

  async save(row: StoredBacktest): Promise<void> {
    await withTimeout(() => this.db.update(deskBacktests).set({ status: row.status, done: row.done, items: row.items, summary: row.summary, tokens: row.tokens, finishedAt: row.finishedAt, error: row.error })
      .where(eq(deskBacktests.id, row.id)), 5000);
  }

  async get(userId: string, id: string): Promise<StoredBacktest | null> {
    const [row] = await withTimeout(() => this.db.select().from(deskBacktests).where(and(eq(deskBacktests.userId, userId), eq(deskBacktests.id, id))), 5000);
    return row ? toBacktest(row) : null;
  }

  async list(userId: string, symbol: string | undefined, limit: number): Promise<StoredBacktest[]> {
    const where = symbol ? and(eq(deskBacktests.userId, userId), eq(deskBacktests.symbol, symbol)) : eq(deskBacktests.userId, userId);
    return (await withTimeout(() => this.db.select().from(deskBacktests).where(where).orderBy(desc(deskBacktests.createdAt)).limit(limit), 5000)).map(toBacktest);
  }
}
