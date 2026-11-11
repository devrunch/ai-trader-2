import { CronExpressionParser } from 'cron-parser';
import type { TaskTrigger } from '@aitrader/contracts';

type TaskState = 'active' | 'paused' | 'done' | 'cancelled' | 'expired';
export interface AgentTask {
  id: string; userId: string; threadId: string | null; mode: 'agent' | 'notify'; title: string; instruction: string; trigger: TaskTrigger; state: TaskState;
  runs: number; maxRuns: number; armed: boolean; lastRunAt: number | null; nextRunAt: number | null; lastError: string | null;
  expiresAt: number; createdAt: number;
}

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
  if (observed === undefined) return { fire: false, task };
  const met = trigger.op === 'above' ? observed > trigger.value : observed < trigger.value;
  if (!met) return { fire: false, task: task.armed ? task : { ...task, armed: true } };
  if (!task.armed) return { fire: false, task };
  const what = trigger.kind === 'price' ? `${trigger.symbol} price` : `${trigger.indicatorId.toUpperCase()} on ${trigger.symbol} ${trigger.interval}`;
  return { fire: true, task: { ...task, armed: false }, reason: `${what} is ${String(observed)}, ${trigger.op} ${String(trigger.value)}` };
}

/** After a run: count it, finish when the run budget is spent. */
export function afterRun(task: AgentTask, now: number, error: string | null): AgentTask {
  const runs = task.runs + 1;
  return { ...task, runs, lastRunAt: now, lastError: error, state: runs >= task.maxRuns ? 'done' : task.state, nextRunAt: runs >= task.maxRuns ? null : task.nextRunAt };
}
