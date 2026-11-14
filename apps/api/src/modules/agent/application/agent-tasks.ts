import { createHash } from 'node:crypto';
import type { AgentTaskDto, AlertCreate, AutoTrade, DeskTask, EconomicEvent, EventScorecard, NewsItemFull, ScanResult, ScreenSpec, TaskOutcome, TaskTrigger } from '@aitrader/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import { afterRun, MAX_TASK_DAYS, nextScheduled, tick, tickWatch, TaskRuleError, type AgentTask, type Fresh, type Tick } from '../domain/agent-task';
import { briefKey, briefReason, formatReactions, type HeldPosition } from '../domain/event-brief';
import { freshMoves, moveSymbols, type MoveWatch } from '../domain/move-watch';
import { describeWatch, dueBriefs, dueEvents, eventReason, freshNews, isWatch, screenOutcome } from '../domain/watch';

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
  news(): Promise<NewsItemFull[]>;
  events(): Promise<EconomicEvent[]>;
  changes(symbols: string[]): Promise<string[]>;
  /** Runs a screen for a user on stored bars; absent when screening is not wired. */
  screen?(spec: ScreenSpec, userId: string): Promise<ScanResult>;
  /** Percent change of each symbol over the last `minutes` (null: no data); absent when move watches are not wired. */
  moves?(symbols: string[], minutes: number, now: number): Promise<Map<string, number | null>>;
  /** The symbols of a universe for a user (a move watch looks at all of them). */
  members?(universe: NonNullable<MoveWatch['universe']>, userId: string): Promise<string[]>;
  /** How past releases of this event moved the market, for the pre-event brief. */
  scorecard?(event: EconomicEvent): Promise<EventScorecard | null>;
  /** The user's open positions among `symbols`. */
  positions?(userId: string, symbols: string[]): Promise<HeldPosition[]>;
}
type MoveBatch = Map<string, number | null>;
/** Runs the assistant for a fired task; `error` is set when the run failed, `outcome` says how it ended. */
export interface FireResult { error: string | null; outcome: TaskOutcome }
export type FireTask = (task: AgentTask, reason: string) => Promise<FireResult>;
/**
 * What happens to a task that is due. A task that runs the assistant or the desk is queued (a worker runs it, `queues` is true); a plain alert is cheap and runs inline.
 * `enqueue` must be idempotent on (task id, key): the same fire twice is one job.
 */
export interface Dispatcher { queues(task: AgentTask): boolean; enqueue(task: AgentTask, key: string): Promise<void>; runInline: FireTask }

/** A queued run nobody has picked up after this long is queued again (the job may have been lost with the queue). */
const RECOVER_AFTER_MS = 10 * 60_000;
/** Identifies one fire of a task so a repeat of it is a no-op in the queue: the run count and schedule slot before it, and what a watch has already reported. */
const fireKey = (before: AgentTask, after: AgentTask): string =>
  createHash('sha1').update(`${String(before.runs)}|${String(before.nextRunAt)}|${String(before.armed)}|${after.seen.slice(before.seen.length).join(',')}`).digest('hex').slice(0, 20);
export interface NewTask { title: string; instruction: string; trigger: TaskTrigger; maxRuns?: number | undefined; expiresInDays?: number | undefined; autoTrade?: AutoTrade | null | undefined; desk?: DeskTask | null | undefined }

const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 6 });

const MAX_ACTIVE_PER_USER = 20;
const MAX_FIRES_PER_TICK = 25;

const dto = (t: AgentTask): AgentTaskDto => ({ id: t.id, threadId: t.threadId, mode: t.mode, title: t.title, instruction: t.instruction, trigger: t.trigger, state: t.state,
  runs: t.runs, maxRuns: t.maxRuns, lastRunAt: t.lastRunAt === null ? null : new Date(t.lastRunAt).toISOString(),
  nextRunAt: t.nextRunAt === null ? null : new Date(t.nextRunAt).toISOString(), lastError: t.lastError, lastOutcome: t.lastOutcome, autoTrade: t.autoTrade, desk: t.desk, runState: t.runState,
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
      runs: 0, maxRuns: input.maxRuns ?? (input.trigger.kind === 'schedule' ? 20 : isWatch(input.trigger) ? 10 : 1), armed, lastRunAt: null, nextRunAt, lastError: null, lastOutcome: null, autoTrade: input.autoTrade ?? null, desk: input.desk ?? null, runState: 'idle', runStateAt: null, pendingFire: null, seen: [],
      expiresAt: now + days * 86_400_000, createdAt: now };
    await this.store.create(task);
    return { ...dto(task), conditionNow };
  }

  /** Switch what a task may trade by itself; only an assistant task in a chat thread can (it needs a run to decide). */
  async setAutoTrade(userId: string, id: string, autoTrade: AutoTrade | null): Promise<AgentTaskDto> {
    const task = await this.store.get(userId, id);
    if (!task) throw new NotFoundError('Task not found', { id });
    if (task.mode !== 'agent' || task.threadId === null) throw new ConflictError('Auto-trade applies to assistant tasks, not plain alerts');
    if (task.state === 'done' || task.state === 'cancelled' || task.state === 'expired') throw new ConflictError(`The task is ${task.state}`);
    const next = { ...task, autoTrade };
    await this.store.save(next);
    return dto(next);
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

  private async releaseText(event: EconomicEvent, briefInThread: boolean): Promise<string> {
    const reactions = formatReactions(event.reactions);
    const lines = reactions.length ? reactions : await this.watches.changes(event.moves.filter(m => m.includes(':'))).catch(() => []);
    return eventReason(event, lines, briefInThread);
  }

  private async briefText(userId: string, event: EconomicEvent): Promise<string> {
    const symbols = event.moves.filter(m => m.includes(':'));
    const [scorecard, positions] = await Promise.all([
      this.watches.scorecard?.(event).catch(() => null) ?? null,
      this.watches.positions?.(userId, symbols).catch((): HeldPosition[] => []) ?? [],
    ]);
    return briefReason(event, scorecard, positions);
  }

  /** For each window length, the changes of every symbol the active move watches need, read in one call. */
  private moveBatches(tasks: AgentTask[], now: number, membersOf: (task: AgentTask, trigger: MoveWatch) => Promise<string[]>): Map<number, Promise<MoveBatch>> {
    const moves = this.watches.moves?.bind(this.watches);
    const wanted = new Map<number, Array<Promise<string[]>>>();
    for (const task of tasks) {
      const { trigger } = task;
      if (trigger.kind !== 'move' || task.state !== 'active' || task.runState !== 'idle' || now >= task.expiresAt || !moves) continue;
      const list = wanted.get(trigger.minutes) ?? [];
      list.push(membersOf(task, trigger).then(m => moveSymbols(trigger, m)));
      wanted.set(trigger.minutes, list);
    }
    const out = new Map<number, Promise<MoveBatch>>();
    for (const [minutes, lists] of wanted) {
      out.set(minutes, Promise.all(lists).then(all => moves?.([...new Set(all.flat())], minutes, now) ?? new Map()).catch((): MoveBatch => new Map()));
    }
    return out;
  }

  /** One pass over every active task: expire, evaluate, fire what is due. Reads each condition, the news and the calendar once per pass. */
  async runDue(dispatch: Dispatcher, signal: AbortSignal): Promise<number> {
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
    let news: Promise<NewsItemFull[]> | undefined;
    let events: Promise<EconomicEvent[]> | undefined;
    // One scan per (user, spec) per pass, however many tasks watch it.
    const scans = new Map<string, Promise<ScanResult | null>>();
    const members = new Map<string, Promise<string[]>>();
    const membersOf = (task: AgentTask, trigger: MoveWatch): Promise<string[]> => {
      const { universe } = trigger;
      if (!universe || !this.watches.members) return Promise.resolve([]);
      const key = `${task.userId}|${universe}`;
      const known = members.get(key) ?? this.watches.members(universe, task.userId).catch(() => []);
      members.set(key, known);
      return known;
    };
    const active = await this.store.active();
    // One batched read per window length per pass, over every symbol the move watches need.
    const batches = this.moveBatches(active, now, membersOf);
    const moveFresh = async (task: AgentTask, trigger: MoveWatch): Promise<Fresh | null> => {
      const changes = await batches.get(trigger.minutes);
      return changes ? freshMoves(task, trigger, changes, await membersOf(task, trigger), now) : null;
    };
    const evaluate = async (task: AgentTask): Promise<Tick> => {
      const { trigger } = task;
      if (trigger.kind === 'schedule') return tick(task, now);
      if (trigger.kind === 'price' || trigger.kind === 'indicator') return tick(task, now, await read(trigger));
      let fresh: Fresh | null = null;
      if (task.state === 'active' && now < task.expiresAt) {
        if (trigger.kind === 'screen') {
          const scanKey = `${task.userId}|${JSON.stringify(trigger.spec)}`;
          const scan = scans.get(scanKey) ?? (this.watches.screen ? this.watches.screen(trigger.spec, task.userId).catch(() => null) : Promise.resolve(null));
          scans.set(scanKey, scan);
          const result = await scan;
          if (result) {
            const outcome = screenOutcome(task, result, now);
            fresh = outcome.fresh;
            if (!fresh && outcome.seen !== task.seen) return { fire: false, task: { ...task, seen: outcome.seen } };
          }
        } else if (trigger.kind === 'move') {
          fresh = await moveFresh(task, trigger);
        } else if (trigger.kind === 'news') {
          news ??= this.watches.news().catch(() => []);
          fresh = freshNews(task, trigger, await (news));
        } else {
          events ??= this.watches.events().catch(() => []);
          const list = await events;
          const [brief] = dueBriefs(task, trigger, list, now);
          const [due] = brief ? [] : dueEvents(task, trigger, list, now);
          if (brief) fresh = { ids: [briefKey(brief.id)], reason: await this.briefText(task.userId, brief) };
          else if (due) fresh = { ids: [due.id], reason: await this.releaseText(due, task.seen.includes(briefKey(due.id))) };
        }
      }
      return tickWatch({ ...task, trigger }, now, fresh);
    };
    let fired = 0;
    for (const task of active) {
      if (signal.aborted) break;
      // One run in flight per task. A queued run that nobody has picked up for a long time is queued again.
      if (task.runState !== 'idle') {
        if (task.pendingFire && task.runStateAt !== null && now - task.runStateAt > RECOVER_AFTER_MS) {
          await dispatch.enqueue(task, task.pendingFire.key).then(() => this.store.save({ ...task, runStateAt: now })).catch(() => undefined);
        }
        continue;
      }
      const result = await evaluate(task);
      if (!result.fire || fired >= MAX_FIRES_PER_TICK) {
        if (result.task !== task && (!result.fire || result.task.seen === task.seen)) await this.store.save(result.task);
        continue;
      }
      fired++;
      if (dispatch.queues(task)) {
        // The pending run is saved before the job exists, so a worker that picks it up at once finds it; if queueing fails the task goes back to how it was and fires again next minute.
        const key = fireKey(task, result.task);
        await this.store.save({ ...result.task, runState: 'queued', runStateAt: now, pendingFire: { key, reason: result.reason } });
        await dispatch.enqueue(result.task, key).catch(async () => { await this.store.save(task); });
        continue;
      }
      await this.store.save(result.task);
      const { error, outcome } = await dispatch.runInline(result.task, result.reason).catch((e: unknown): FireResult => ({ error: e instanceof Error ? e.message : 'run failed', outcome: 'error' }));
      await this.store.save(afterRun(result.task, this.env.now(), error, outcome));
    }
    return fired;
  }
}
