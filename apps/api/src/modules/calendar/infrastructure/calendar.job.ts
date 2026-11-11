import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { EconomicCalendar } from '../application/calendar';

const logger = new Logger('Calendar');

/** Every three hours: the feed changes rarely and asks for few requests. */
export class CalendarJob implements OnModuleInit {
  constructor(private readonly scheduler: JobScheduler, private readonly calendar: EconomicCalendar) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.register({ name: 'calendar-refresh', cron: '7 */3 * * *', tz: 'Asia/Kolkata', graceMs: 3 * 3_600_000, maxRuntimeMs: 60_000,
      run: async signal => { logger.log({ message: 'calendar refreshed', events: await this.calendar.refresh(signal) }); } });
  }
}
