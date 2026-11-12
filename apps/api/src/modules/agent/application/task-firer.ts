import { Logger } from '@nestjs/common';
import type { AgentTask } from '../domain/agent-task';
import { isWatch, parseWatchReply, WATCH_REPLY_RULE } from '../domain/watch';
import type { FireResult } from './agent-tasks';
import type { BackgroundRuns } from './agent-trader';
import type { ChatService, WindowLimiter } from './chat-service';
import type { DeskTaskRunner } from './desk-task';

interface Notify { notify(n: { userId: string; kind: 'task'; title: string; body?: string | null; link?: { threadId?: string; symbol?: string } }): Promise<void> }
export interface WatchLimits { limiter: WindowLimiter; dailyRuns: number; now: () => number }

const logger = new Logger('TaskFirer');
const DAY_MS = 86_400_000;

/** A run that failed in a way that may pass on a second try (the model or the network), as opposed to a refusal that will not. */
export class TransientRunError extends Error { override readonly name = 'TransientRunError'; }
const TRANSIENT = /timeout|timed out|abort|network|fetch failed|econn|etimedout|eai_again|socket|overload|unavailable|temporar|bad gateway|\b5\d\d\b|throttl|too many requests/i;

/** Runs a fired assistant or desk task. The daily caps are checked here, at run time, so a queued run still obeys them. */
export class TaskFirer {
  constructor(private readonly chat: ChatService, private readonly notifications: Notify, private readonly watch: WatchLimits, private readonly runs: BackgroundRuns,
    private readonly desk: DeskTaskRunner) {}

  async fire(task: AgentTask, reason: string, signal: AbortSignal): Promise<FireResult> {
    if (task.desk) return this.desk.fire(task, reason, signal);
    if (task.threadId === null) return { error: 'The task has no conversation to run in', outcome: 'error' };
    const watching = isWatch(task.trigger);
    // Each watch wake-up costs a model run, so the day's total per user is capped; a refused run is not counted against the task.
    if (watching && !(await this.watch.limiter.take(`watch:${task.userId}:${String(Math.floor(this.watch.now() / DAY_MS))}`, this.watch.dailyRuns, DAY_MS))) {
      logger.warn({ message: 'watch wake-up skipped: daily cap', userId: task.userId, taskId: task.id });
      return { error: null, outcome: 'capped' };
    }
    const header = `[Background ${watching ? 'watch' : 'task'} "${task.title}" fired: ${reason}. Run ${String(task.runs + 1)} of ${String(task.maxRuns)}.]`;
    const threadId = task.threadId;
    const trading = task.autoTrade?.enabled ? '\n\nAuto-trade is ON for this task (PAPER money): you may place the entry yourself with placePaperOrder, with a stop, a rationale and the skill used, inside the limits you are given. Otherwise your order becomes a card for the user.' : '';
    const { error, reply } = await this.runs.during(threadId, { task, reason, backtest: null },
      () => this.chat.runInBackground(task.userId, threadId, `${header}\n${task.instruction}${trading}${watching ? `\n\n${WATCH_REPLY_RULE}` : ''}`));
    if (error && TRANSIENT.test(error)) throw new TransientRunError(error);
    if (watching && !error) {
      const verdict = parseWatchReply(reply);
      if (!verdict.report) return { error: null, outcome: 'silent' };
      await this.notifications.notify({ userId: task.userId, kind: 'task', title: `Watch: ${task.title}`, body: verdict.text.slice(0, 600), link: { threadId } });
      return { error: null, outcome: 'report' };
    }
    // The last lines are the summary the prompt asks for; the full reply is in the task's thread.
    await this.notifications.notify({ userId: task.userId, kind: 'task', title: error ? `Task "${task.title}" failed` : `Task "${task.title}" ran`,
      body: error ?? reply.trim().split('\n').filter(Boolean).slice(-3).join('\n').slice(-600), link: { threadId } });
    return { error, outcome: error ? 'error' : 'ran' };
  }
}
