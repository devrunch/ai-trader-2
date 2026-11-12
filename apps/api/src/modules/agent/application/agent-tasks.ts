import type { AgentTaskDto, AlertCreate, EconomicEvent, NewsItem, TaskOutcome, TaskTrigger } from '@aitrader/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import { afterRun, MAX_TASK_DAYS, nextScheduled, tick, tickWatch, TaskRuleError, type AgentTask, type Fresh, type Tick } from '../domain/agent-task';
import { describeWatch, dueEvents, eventReason, freshNews, isWatch } from '../domain/watch';

export interface TaskStore {
  create(task: AgentTask): Promise<void>;
  save(task: AgentTask): Promise<void>;
  get(userId: string, id: string): Promise<AgentTask | null>;
  list(userId: string): Promise<AgentTask[]>;
  active(): Promise<AgentTask[]>;
}
type Condition = Extract<TaskTrigger, { kind: 'price' | 'indicator' }>;
/** Reads the value a condition compares: a last price, or an indicator's newest value. Undefined when there is no data. */
export interface ConditionReader { read(trigger: Condition): Promise<number | undefined> }
/** What the news and the calendar hold for news and event watches. `changes` formats each instrument's move for the wake-up text. */
export interface WatchReader {
  news(): Promise<NewsItem[]>;
  events(): Promise<EconomicEvent[]>;
  changes(symbols: string[]): Promise<string[]>;
}
/** Runs the assistant for a fired task; `error` is set when the run failed, `outcome` says how it ended. */
export interface FireResult { error: string | null; outcome: TaskOutcome }
export type FireTask = (task: AgentTask, reason: string) => Promise<FireResult>;
export interface NewTask { title: string; instruction: string; trigger: TaskTrigger; maxRuns?: number | undefined; expiresInDays?: number | undefined }

const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 6 });

const MAX_ACTIVE_PER_USER = 20;
const MAX_FIRES_PER_TICK = 25;

const dto = (t: AgentTask): AgentTaskDto => ({ id: t.id, threadId: t.threadId, mode: t.mode, title: t.title, instruction: t.instruction, trigger: t.trigger, state: t.state,
  runs: t.runs, maxRuns: t.maxRuns, lastRunAt: t.lastRunAt === null ? null : new Date(t.lastRunAt).toISOString(),
  nextRunAt: t.nextRunAt === null ? null : new Date(t.nextRunAt).toISOString(), lastError: t.lastError, lastOutcome: t.lastOutcome,
  expiresAt: new Date(t.expiresAt).toISOString(), createdAt: new Date(t.createdAt).toISOString() });

/** Background work for the assistant: scheduled runs and wake-on-condition (owner request 2026-11-10). */
export class AgentTasks {
  constructor(private readonly store: TaskStore, private readonly conditions: ConditionReader,
    private readonly watches: WatchReader, private readonly env: { now: () => number; id: () => string }) {}

  /** A user alert: no model runs; each fire is an in-app notification. Repeating alerts fire on every fresh crossing for 30 days. */
  async createAlert(userId: string, input: AlertCreate): Promise<AgentTaskDto & { conditionNow: number | null }> {
    const t = input.trigger;
    const title = isWatch(t) ? describeWatch(t) : (() => {
      const what = t.kind === 'price' ? t.symbol : `${t.indicatorId.toUpperCase()}${t.plot ? ` ${t.plot}` : ''} ${t.symbol} ${t.interval}`;
      return `${what} ${t.op} ${num.format(t.value)}`;
    })();
    return this.create(userId, null, { title, instruction: input.note ?? '', trigger: t, maxRuns: input.repeat ? 500 : 1, expiresInDays: 30 }, 'notify');
  }

  async create(userId: string, threadId: string | null, input: NewTask, mode: 'agent' | 'notify' = 'agent'): Promise<AgentTaskDto & { conditionNow: number | null }> {
    const active = (await this.store.list(userId)).filter(t => t.state === 'active').length;
    if (active >= MAX_ACTIVE_PER_USER) throw new ConflictError(`At most ${String(MAX_ACTIVE_PER_USER)} active tasks; cancel one first`);
    const now = this.env.now();
    const days = Math.min(input.expiresInDays ?? 7, MAX_TASK_DAYS);
    let nextRunAt: number | null = null;
    let armed = true;
    let conditionNow: number | null = null;
    if (input.trigger.kind === 'schedule') {
      try { nextRunAt = nextScheduled(input.trigger, now); } catch (error) { throw new ValidationError(error instanceof TaskRuleError ? error.message : 'Invalid schedule'); }
    } else if (!isWatch(input.trigger)) {
      // Already true at creation: wait for it to turn false and cross again, so the task never fires on stale state.
      const observed = await this.conditions.read(input.trigger);
      conditionNow = observed ?? null;
      if (observed !== undefined) armed = !(input.trigger.op === 'above' ? observed > input.trigger.value : observed < input.trigger.value);
    }
    const task: AgentTask = { id: this.env.id(), userId, threadId, mode, title: input.title, instruction: input.instruction, trigger: input.trigger, state: 'active',
      runs: 0, maxRuns: input.maxRuns ?? (input.trigger.kind === 'schedule' ? 20 : isWatch(input.trigger) ? 10 : 1), armed, lastRunAt: null, nextRunAt, lastError: null, lastOutcome: null, seen: [],
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

  /** One pass over every active task: expire, evaluate, fire what is due. Reads each condition, the news and the calendar once per pass. */
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
    let news: Promise<NewsItem[]> | undefined;
    let events: Promise<EconomicEvent[]> | undefined;
    const evaluate = async (task: AgentTask): Promise<Tick> => {
      const { trigger } = task;
      if (trigger.kind === 'schedule') return tick(task, now);
      if (trigger.kind === 'price' || trigger.kind === 'indicator') return tick(task, now, await read(trigger));
      let fresh: Fresh | null = null;
      if (task.state === 'active' && now < task.expiresAt) {
        if (trigger.kind === 'news') {
          news ??= this.watches.news().catch(() => []);
          fresh = freshNews(task, trigger, await (news));
        } else {
          events ??= this.watches.events().catch(() => []);
          const [due] = dueEvents(task, trigger, await (events), now);
          if (due) fresh = { ids: [due.id], reason: eventReason(due, await this.watches.changes(due.moves.filter(m => m.includes(':'))).catch(() => [])) };
        }
      }
      return tickWatch({ ...task, trigger }, now, fresh);
    };
    let fired = 0;
    for (const task of await this.store.active()) {
      if (signal.aborted) break;
      const result = await evaluate(task);
      if (!result.fire || fired >= MAX_FIRES_PER_TICK) {
        if (result.task !== task && (!result.fire || result.task.seen === task.seen)) await this.store.save(result.task);
        continue;
      }
      fired++;
      await this.store.save(result.task);
      const { error, outcome } = await fire(result.task, result.reason).catch((e: unknown): FireResult => ({ error: e instanceof Error ? e.message : 'run failed', outcome: 'error' }));
      await this.store.save(afterRun(result.task, this.env.now(), error, outcome));
    }
    return fired;
  }
}
