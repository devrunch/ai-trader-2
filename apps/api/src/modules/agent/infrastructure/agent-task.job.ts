import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { AgentTasks } from '../application/agent-tasks';
import type { ChatService } from '../application/chat-service';

interface Notify { notify(n: { userId: string; kind: 'task' | 'alert'; title: string; body?: string | null; link?: { threadId?: string; symbol?: string } }): Promise<void> }

const logger = new Logger('AgentTasks');

/** Every minute: fire due background tasks. The scheduler runs it once per tick across instances. */
export class AgentTaskJob implements OnModuleInit {
  constructor(private readonly scheduler: JobScheduler, private readonly tasks: AgentTasks, private readonly chat: ChatService, private readonly notifications: Notify) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.register({ name: 'agent-tasks', cron: '* * * * *', tz: 'Asia/Kolkata', graceMs: 0, maxRuntimeMs: 55_000,
      run: async signal => {
        const fired = await this.tasks.runDue(async (task, reason) => {
          if (task.mode === 'notify' || task.threadId === null) {
            const symbol = task.trigger.kind === 'schedule' ? undefined : task.trigger.symbol;
            await this.notifications.notify({ userId: task.userId, kind: 'alert', title: `Alert: ${task.title}`,
              body: [reason, task.instruction].filter(Boolean).join('\n'), ...(symbol ? { link: { symbol } } : {}) });
            return null;
          }
          const { error, reply } = await this.chat.runInBackground(task.userId, task.threadId,
            `[Background task "${task.title}" fired: ${reason}. Run ${String(task.runs + 1)} of ${String(task.maxRuns)}.]\n${task.instruction}`);
          // The last lines are the summary the prompt asks for; the full reply is in the task's thread.
          await this.notifications.notify({ userId: task.userId, kind: 'task', title: error ? `Task "${task.title}" failed` : `Task "${task.title}" ran`,
            body: error ?? reply.trim().split('\n').filter(Boolean).slice(-3).join('\n').slice(-600), link: { threadId: task.threadId } });
          return error;
        }, signal);
        if (fired > 0) logger.log({ message: 'agent tasks fired', fired });
      } });
  }
}
