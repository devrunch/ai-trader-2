import { and, desc, eq } from 'drizzle-orm';
import { AutoTradeSchema, DeskTaskSchema, TASK_OUTCOMES, TaskTriggerSchema } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Database } from '../../../shared/database';
import { agentTasks } from '../../../shared/database/schema';
import type { TaskStore } from '../application/agent-tasks';
import type { AgentTask } from '../domain/agent-task';

const State = z.enum(['active', 'paused', 'done', 'cancelled', 'expired']);
const Mode = z.enum(['agent', 'notify']);
const Outcome = z.enum(TASK_OUTCOMES);
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const ms = (value: string | null) => (value === null ? null : Date.parse(value));
type Row = typeof agentTasks.$inferSelect;
const toTask = (r: Row): AgentTask => ({ id: r.id, userId: r.userId, threadId: r.threadId, mode: Mode.parse(r.mode), title: r.title, instruction: r.instruction,
  trigger: TaskTriggerSchema.parse(r.trigger), state: State.parse(r.state), runs: r.runs, maxRuns: r.maxRuns, armed: r.armed,
  lastRunAt: ms(r.lastRunAt), nextRunAt: ms(r.nextRunAt), lastError: r.lastError, lastOutcome: r.lastOutcome === null ? null : Outcome.parse(r.lastOutcome), seen: r.seen, autoTrade: r.autoTrade === null ? null : AutoTradeSchema.parse(r.autoTrade), desk: r.desk === null ? null : DeskTaskSchema.parse(r.desk), expiresAt: Date.parse(r.expiresAt), createdAt: Date.parse(r.createdAt) });
const toRow = (t: AgentTask) => ({ id: t.id, userId: t.userId, threadId: t.threadId, mode: t.mode, title: t.title, instruction: t.instruction, trigger: t.trigger,
  state: t.state, runs: t.runs, maxRuns: t.maxRuns, armed: t.armed, lastRunAt: iso(t.lastRunAt), nextRunAt: iso(t.nextRunAt), lastError: t.lastError, lastOutcome: t.lastOutcome, seen: t.seen, autoTrade: t.autoTrade, desk: t.desk,
  expiresAt: new Date(t.expiresAt).toISOString(), createdAt: new Date(t.createdAt).toISOString() });

export class DrizzleTaskStore implements TaskStore {
  constructor(private readonly db: Database) {}
  async create(task: AgentTask): Promise<void> { await withTimeout(() => this.db.insert(agentTasks).values(toRow(task)), 5000); }
  async save(task: AgentTask): Promise<void> {
    const row = toRow(task);
    await withTimeout(() => this.db.update(agentTasks).set({ state: row.state, runs: row.runs, armed: row.armed, lastRunAt: row.lastRunAt,
      nextRunAt: row.nextRunAt, lastError: row.lastError, lastOutcome: row.lastOutcome, seen: row.seen, autoTrade: row.autoTrade, desk: row.desk }).where(eq(agentTasks.id, task.id)), 5000);
  }
  async get(userId: string, id: string): Promise<AgentTask | null> {
    const [row] = await withTimeout(() => this.db.select().from(agentTasks).where(and(eq(agentTasks.id, id), eq(agentTasks.userId, userId))), 5000);
    return row ? toTask(row) : null;
  }
  async list(userId: string): Promise<AgentTask[]> {
    const rows = await withTimeout(() => this.db.select().from(agentTasks).where(eq(agentTasks.userId, userId)).orderBy(desc(agentTasks.createdAt)).limit(100), 5000);
    return rows.map(toTask);
  }
  async active(): Promise<AgentTask[]> {
    const rows = await withTimeout(() => this.db.select().from(agentTasks).where(eq(agentTasks.state, 'active')).limit(2000), 5000);
    return rows.map(toTask);
  }
}
