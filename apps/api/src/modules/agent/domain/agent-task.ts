import { CronExpressionParser } from 'cron-parser';
import type { AutoTrade, DeskTask, TaskOutcome, TaskTrigger } from '@aitrader/contracts';

type TaskState = 'active' | 'paused' | 'done' | 'cancelled' | 'expired';
export interface AgentTask {
  id: string; userId: string; threadId: string | null; mode: 'agent' | 'notify'; title: string; instruction: string; trigger: TaskTrigger; state: TaskState;
  runs: number; maxRuns: number; armed: boolean; lastRunAt: number | null; nextRunAt: number | null; lastError: string | null;
  /** What the task may trade by itself (paper money); null: it proposes cards instead. */ autoTrade: AutoTrade | null;
  /** Set: a fire runs the trading desk for this symbol instead of a single assistant turn. */ desk: DeskTask | null;
  /** A fire waiting for, or in, a worker: queued -> running -> idle. `pendingFire` is what the worker runs, so a lost job can be queued again. */
  runState: 'idle' | 'queued' | 'running'; runStateAt: number | null; pendingFire: { key: string; reason: string } | null;
  /** How the last run ended. */ lastOutcome: TaskOutcome | null;
  /** Headline and event ids a watch has already reported, newest last. */ seen: string[];
  expiresAt: number; createdAt: number;
}

/** What a fired watch passes on: the ids to remember so they never fire twice, the wake-up text, and for a screen the symbol a desk run should look at. */
export interface Fresh { ids: string[]; reason: string; deskSymbol?: string }
export const MAX_SEEN = 200;

const MIN_SCHEDULE_GAP_MS = 5 * 60_000;
export const MAX_TASK_DAYS = 30;

export class TaskRuleError extends Error { override readonly name = 'TaskRuleError'; }

/** The next schedule time after `from`; refuses expressions that would wake the assistant more than every 5 minutes. */
export function nextScheduled(trigger: Extract<TaskTrigger, { kind: 'schedule' }>, from: number): number {
  let expression;
  try { expression = CronExpressionParser.parse(trigger.cron, { currentDate: new Date(from), tz: trigger.tz }); }
  catch { throw new TaskRuleError(`Not a valid cron expression: "${trigger.cron}"`); }
  const first = expression.next().getTime();
  const second = expression.next().getTime();
  if (second - first < MIN_SCHEDULE_GAP_MS) throw new TaskRuleError('Schedules may run at most every 5 minutes');
  return first;
}

type WatchKind = Extract<TaskTrigger, { kind: 'news' | 'event' | 'screen' | 'move' }>;

export type Tick = { fire: false; task: AgentTask } | { fire: true; task: AgentTask; reason: string };

/**
 * One evaluation of a task at `now`. Conditions fire on the edge: when they become true after having been false,
 * so a price sitting above a level fires once, not every minute. `observed` is the condition's value now (undefined: no data).
 */
export function tick(task: AgentTask, now: number, observed?: number): Tick {
  if (task.state !== 'active') return { fire: false, task };
  if (now >= task.expiresAt) return { fire: false, task: { ...task, state: 'expired', nextRunAt: null } };
  const { trigger } = task;
  if (trigger.kind === 'schedule') {
    if (task.nextRunAt === null || now < task.nextRunAt) return { fire: false, task };
    return { fire: true, task: { ...task, nextRunAt: nextScheduled(trigger, now) }, reason: `scheduled run (${trigger.cron} ${trigger.tz})` };
  }
  if (trigger.kind === 'news' || trigger.kind === 'event' || trigger.kind === 'screen' || trigger.kind === 'move') return { fire: false, task };
  if (observed === undefined) return { fire: false, task };
  const met = trigger.op === 'above' ? observed > trigger.value : observed < trigger.value;
  if (!met) return { fire: false, task: task.armed ? task : { ...task, armed: true } };
  if (!task.armed) return { fire: false, task };
  const what = trigger.kind === 'price' ? `${trigger.symbol} price` : `${trigger.indicatorId.toUpperCase()} on ${trigger.symbol} ${trigger.interval}`;
  return { fire: true, task: { ...task, armed: false }, reason: `${what} is ${String(observed)}, ${trigger.op} ${String(trigger.value)}` };
}

/** A news or event watch with something new: remember the ids so each headline or release fires once, then wake. */
export function tickWatch(task: AgentTask & { trigger: WatchKind }, now: number, fresh: Fresh | null): Tick {
  if (task.state !== 'active') return { fire: false, task };
  if (now >= task.expiresAt) return { fire: false, task: { ...task, state: 'expired', nextRunAt: null } };
  if (!fresh) return { fire: false, task };
  const desk = task.desk && fresh.deskSymbol ? { ...task.desk, symbol: fresh.deskSymbol } : task.desk;
  return { fire: true, task: { ...task, desk, seen: [...task.seen, ...fresh.ids].slice(-MAX_SEEN) }, reason: fresh.reason };
}

/** After a run: count it, finish when the run budget is spent. */
export function afterRun(task: AgentTask, now: number, error: string | null, outcome: TaskOutcome = error ? 'error' : 'ran'): AgentTask {
  const settled = { ...task, runState: 'idle' as const, runStateAt: now, pendingFire: null };
  // A run the daily cap refused does not use up the task's run budget.
  const runs = outcome === 'capped' ? task.runs : task.runs + 1;
  return { ...settled, runs, lastRunAt: now, lastError: error, lastOutcome: outcome, state: runs >= task.maxRuns ? 'done' : task.state, nextRunAt: runs >= task.maxRuns ? null : task.nextRunAt };
}
