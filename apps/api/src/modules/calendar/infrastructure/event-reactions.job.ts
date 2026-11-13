import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { CaptureReactions } from '../application/capture-reactions';

const logger = new Logger('EventReactions');

/** Every ten minutes: stores how instruments moved after events released more than 65 minutes ago. */
export class EventReactionsJob implements OnModuleInit {
  constructor(private readonly scheduler: JobScheduler, private readonly capture: CaptureReactions) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.register({ name: 'event-reactions', cron: '*/10 * * * *', tz: 'Asia/Kolkata', graceMs: 600_000, maxRuntimeMs: 120_000,
      run: async () => { logger.log({ message: 'event reactions captured', events: await this.capture.run() }); } });
  }
}
