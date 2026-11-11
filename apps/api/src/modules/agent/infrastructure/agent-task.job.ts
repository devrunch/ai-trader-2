import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { AgentTasks } from '../application/agent-tasks';
import type { ChatService } from '../application/chat-service';

const logger = new Logger('AgentTasks');

/** Every minute: fire due background tasks. The scheduler runs it once per tick across instances. */
export class AgentTaskJob implements OnModuleInit {
  constructor(private readonly scheduler: JobScheduler, private readonly tasks: AgentTasks, private readonly chat: ChatService) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.register({ name: 'agent-tasks', cron: '* * * * *', tz: 'Asia/Kolkata', graceMs: 0, maxRuntimeMs: 55_000,
      run: async signal => {
        const fired = await this.tasks.runDue((task, reason) => this.chat.runInBackground(task.userId, task.threadId,
          `[Background task "${task.title}" fired: ${reason}. Run ${String(task.runs + 1)} of ${String(task.maxRuns)}.]\n${task.instruction}`), signal);
        if (fired > 0) logger.log({ message: 'agent tasks fired', fired });
      } });
  }
}
