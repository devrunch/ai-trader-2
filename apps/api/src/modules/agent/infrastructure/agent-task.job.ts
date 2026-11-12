import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { AgentTasks, FireResult } from '../application/agent-tasks';
import type { ChatService, WindowLimiter } from '../application/chat-service';
import type { AgentTask } from '../domain/agent-task';
import { isWatch, parseWatchReply, WATCH_REPLY_RULE } from '../domain/watch';

interface Notify { notify(n: { userId: string; kind: 'task' | 'alert'; title: string; body?: string | null; link?: { threadId?: string; symbol?: string } }): Promise<void> }
export interface WatchLimits { limiter: WindowLimiter; dailyRuns: number; now: () => number }

const logger = new Logger('AgentTasks');
const DAY_MS = 86_400_000;

const symbolOf = (task: AgentTask): string | undefined => {
  const { trigger } = task;
  if (trigger.kind === 'price' || trigger.kind === 'indicator') return trigger.symbol;
  return trigger.kind === 'news' ? trigger.symbols[0] : undefined;
};

/** Every minute: fire due background tasks. The scheduler runs it once per tick across instances. */
export class AgentTaskJob implements OnModuleInit {
  constructor(private readonly scheduler: JobScheduler, private readonly tasks: AgentTasks, private readonly chat: ChatService, private readonly notifications: Notify,
    private readonly watch: WatchLimits) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.register({ name: 'agent-tasks', cron: '* * * * *', tz: 'Asia/Kolkata', graceMs: 0, maxRuntimeMs: 55_000,
      run: async signal => {
        const fired = await this.tasks.runDue((task, reason) => this.fire(task, reason), signal);
        if (fired > 0) logger.log({ message: 'agent tasks fired', fired });
      } });
  }

  private async fire(task: AgentTask, reason: string): Promise<FireResult> {
    if (task.mode === 'notify' || task.threadId === null) {
      const symbol = symbolOf(task);
      await this.notifications.notify({ userId: task.userId, kind: 'alert', title: `Alert: ${task.title}`,
        body: [reason, task.instruction].filter(Boolean).join('\n').slice(0, 1000), ...(symbol ? { link: { symbol } } : {}) });
      return { error: null, outcome: 'notified' };
    }
    const watching = isWatch(task.trigger);
    // Each watch wake-up costs a model run, so the day's total per user is capped; a refused run is not counted against the task.
    if (watching && !(await this.watch.limiter.take(`watch:${task.userId}:${String(Math.floor(this.watch.now() / DAY_MS))}`, this.watch.dailyRuns, DAY_MS))) {
      logger.warn({ message: 'watch wake-up skipped: daily cap', userId: task.userId, taskId: task.id });
      return { error: null, outcome: 'capped' };
    }
    const header = `[Background ${watching ? 'watch' : 'task'} "${task.title}" fired: ${reason}. Run ${String(task.runs + 1)} of ${String(task.maxRuns)}.]`;
    const { error, reply } = await this.chat.runInBackground(task.userId, task.threadId, `${header}\n${task.instruction}${watching ? `\n\n${WATCH_REPLY_RULE}` : ''}`);
    if (watching && !error) {
      const verdict = parseWatchReply(reply);
      if (!verdict.report) return { error: null, outcome: 'silent' };
      await this.notifications.notify({ userId: task.userId, kind: 'task', title: `Watch: ${task.title}`, body: verdict.text.slice(0, 600), link: { threadId: task.threadId } });
      return { error: null, outcome: 'report' };
    }
    // The last lines are the summary the prompt asks for; the full reply is in the task's thread.
    await this.notifications.notify({ userId: task.userId, kind: 'task', title: error ? `Task "${task.title}" failed` : `Task "${task.title}" ran`,
      body: error ?? reply.trim().split('\n').filter(Boolean).slice(-3).join('\n').slice(-600), link: { threadId: task.threadId } });
    return { error, outcome: error ? 'error' : 'ran' };
  }
}
