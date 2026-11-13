import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { CaptureActuals } from '../application/capture-actuals';

const logger = new Logger('EventActuals');
const MINUTE = 60_000;

/**
 * Every minute (India time), but a source is only asked about events from 2 minutes before to 90 minutes after their release, so vendors see a handful of
 * requests per release and none the rest of the day. Idempotent: an event with an actual is not rewritten with the same value.
 */
export class EventActualsJob implements OnModuleInit {
  constructor(private readonly scheduler: JobScheduler, private readonly capture: CaptureActuals) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.register({ name: 'event-actuals', cron: '* * * * *', tz: 'Asia/Kolkata', graceMs: 5 * MINUTE, maxRuntimeMs: 45_000,
      run: async signal => {
        // A release is "due" from 2 minutes before to 90 minutes after `at`: events whose `at` lies in [now - 90 min, now + 2 min].
        const stored = await this.capture.run(signal, { behindMs: 90 * MINUTE, aheadMs: 2 * MINUTE });
        if (stored > 0) logger.log({ message: 'event actuals stored', stored });
      } });
  }
}
