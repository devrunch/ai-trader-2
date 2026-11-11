import type { AgentTaskDto, TaskTrigger } from '@aitrader/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import { afterRun, MAX_TASK_DAYS, nextScheduled, tick, TaskRuleError, type AgentTask } from '../domain/agent-task';

export interface TaskStore {
  create(task: AgentTask): Promise<void>;
  save(task: AgentTask): Promise<void>;
  get(userId: string, id: string): Promise<AgentTask | null>;
  list(userId: string): Promise<AgentTask[]>;
  active(): Promise<AgentTask[]>;
}
type Condition = Exclude<TaskTrigger, { kind: 'schedule' }>;
/** Reads the value a condition compares: a last price, or an indicator's newest value. Undefined when there is no data. */
export interface ConditionReader { read(trigger: Condition): Promise<number | undefined> }
/** Runs the assistant for a fired task; resolves to an error message, or null when the run finished. */
export type FireTask = (task: AgentTask, reason: string) => Promise<string | null>;
export interface NewTask { title: string; instruction: string; trigger: TaskTrigger; maxRuns?: number | undefined; expiresInDays?: number | undefined }

const MAX_ACTIVE_PER_USER = 20;
const MAX_FIRES_PER_TICK = 25;

const dto = (t: AgentTask): AgentTaskDto => ({ id: t.id, threadId: t.threadId, title: t.title, instruction: t.instruction, trigger: t.trigger, state: t.state,
  runs: t.runs, maxRuns: t.maxRuns, lastRunAt: t.lastRunAt === null ? null : new Date(t.lastRunAt).toISOString(),
  nextRunAt: t.nextRunAt === null ? null : new Date(t.nextRunAt).toISOString(), lastError: t.lastError,
  expiresAt: new Date(t.expiresAt).toISOString(), createdAt: new Date(t.createdAt).toISOString() });

/** Background work for the assistant: scheduled runs and wake-on-condition (owner request 2026-11-10). */
export class AgentTasks {
  constructor(private readonly store: TaskStore, private readonly conditions: ConditionReader,
    private readonly env: { now: () => number; id: () => string }) {}

  async create(userId: string, threadId: string, input: NewTask): Promise<AgentTaskDto & { conditionNow: number | null }> {
    const active = (await this.store.list(userId)).filter(t => t.state === 'active').length;
    if (active >= MAX_ACTIVE_PER_USER) throw new ConflictError(`At most ${String(MAX_ACTIVE_PER_USER)} active tasks; cancel one first`);
    const now = this.env.now();
    const days = Math.min(input.expiresInDays ?? 7, MAX_TASK_DAYS);
    let nextRunAt: number | null = null;
    let armed = true;
    let conditionNow: number | null = null;
    if (input.trigger.kind === 'schedule') {
      try { nextRunAt = nextScheduled(input.trigger, now); } catch (error) { throw new ValidationError(error instanceof TaskRuleError ? error.message : 'Invalid schedule'); }
    } else {
      // Already true at creation: wait for it to turn false and cross again, so the task never fires on stale state.
      const observed = await this.conditions.read(input.trigger);
      conditionNow = observed ?? null;
      if (observed !== undefined) armed = !(input.trigger.op === 'above' ? observed > input.trigger.value : observed < input.trigger.value);
    }
    const task: AgentTask = { id: this.env.id(), userId, threadId, title: input.title, instruction: input.instruction, trigger: input.trigger, state: 'active',
      runs: 0, maxRuns: input.maxRuns ?? (input.trigger.kind === 'schedule' ? 20 : 1), armed, lastRunAt: null, nextRunAt, lastError: null,
      expiresAt: now + days * 86_400_000, createdAt: now };
    await this.store.create(task);
    return { ...dto(task), conditionNow };
  }

  async list(userId: string): Promise<AgentTaskDto[]> { return (await this.store.list(userId)).map(dto); }

  async setState(userId: string, id: string, state: 'active' | 'paused' | 'cancelled'): Promise<AgentTaskDto> {
    const task = await this.store.get(userId, id);
    if (!task) throw new NotFoundError('Task not found', { id });
    if (task.state === 'done' || task.state === 'cancelled' || task.state === 'expired') throw new ConflictError(`The task is ${task.state}`);
    const next = { ...task, state, nextRunAt: state === 'active' && task.trigger.kind === 'schedule' ? nextScheduled(task.trigger, this.env.now()) : task.nextRunAt };
    await this.store.save(next);
    return dto(next);
  }

  /** One pass over every active task: expire, evaluate, fire what is due. Reads each condition once per pass. */
  async runDue(fire: FireTask, signal: AbortSignal): Promise<number> {
    const now = this.env.now();
    const cache = new Map<string, Promise<number | undefined>>();
    const read = (trigger: Condition) => {
      const key = JSON.stringify(trigger.kind === 'price' ? [trigger.symbol] : [trigger.symbol, trigger.interval, trigger.indicatorId, trigger.inputs, trigger.plot]);
      const known = cache.get(key);
      if (known) return known;
      const value = this.conditions.read(trigger).catch(() => undefined);
      cache.set(key, value);
      return value;
    };
    let fired = 0;
    for (const task of await this.store.active()) {
      if (signal.aborted) break;
      const result = tick(task, now, task.trigger.kind === 'schedule' ? undefined : await read(task.trigger));
      if (!result.fire || fired >= MAX_FIRES_PER_TICK) {
        if (result.task !== task) await this.store.save(result.task);
        continue;
      }
      fired++;
      await this.store.save(result.task);
      const error = await fire(result.task, result.reason).catch((e: unknown) => (e instanceof Error ? e.message : 'run failed'));
      await this.store.save(afterRun(result.task, this.env.now(), error));
    }
    return fired;
  }
}
