import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { AgentTasks, Dispatcher } from '../application/agent-tasks';
import type { RunQueue } from '../application/run-queue';
import type { AgentTask } from '../domain/agent-task';

interface Notify { notify(n: { userId: string; kind: 'alert'; title: string; body?: string | null; link?: { symbol?: string } }): Promise<void> }

const logger = new Logger('AgentTasks');

const symbolOf = (task: AgentTask): string | undefined => {
  const { trigger } = task;
  if (trigger.kind === 'price' || trigger.kind === 'indicator') return trigger.symbol;
  return trigger.kind === 'news' ? trigger.symbols[0] : undefined;
};

/**
 * Every minute: find the tasks that are due. A plain alert is a notification and is sent here; a task that runs the assistant or the desk is only
 * queued, and a worker runs it (AG-6), so one slow run cannot hold up the tick or the others.
 */
export class AgentTaskJob implements OnModuleInit, Dispatcher {
  constructor(private readonly scheduler: JobScheduler, private readonly tasks: AgentTasks, private readonly queue: RunQueue, private readonly notifications: Notify) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.register({ name: 'agent-tasks', cron: '* * * * *', tz: 'Asia/Kolkata', graceMs: 0, maxRuntimeMs: 55_000,
      run: async signal => {
        const fired = await this.tasks.runDue(this, signal);
        if (fired > 0) logger.log({ message: 'agent tasks fired', fired });
      } });
  }

  queues(task: AgentTask): boolean { return !(task.mode === 'notify' || task.threadId === null); }

  enqueue(task: AgentTask, key: string): Promise<void> { return this.queue.enqueue({ taskId: task.id, userId: task.userId, key }); }

  async runInline(task: AgentTask, reason: string): Promise<{ error: null; outcome: 'notified' }> {
    const symbol = symbolOf(task);
    await this.notifications.notify({ userId: task.userId, kind: 'alert', title: `Alert: ${task.title}`,
      body: [reason, task.instruction].filter(Boolean).join('\n').slice(0, 1000), ...(symbol ? { link: { symbol } } : {}) });
    return { error: null, outcome: 'notified' };
  }
}
