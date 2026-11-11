import { createHash } from 'node:crypto';
import { Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database';
import { JobScheduler } from '../../shared/jobs';
import { AuthModule } from '../auth/auth.module';
import { CalendarController } from './api/calendar.controller';
import { EconomicCalendar } from './application/calendar';
import { CalendarJob } from './infrastructure/calendar.job';
import { DrizzleCalendarStore } from './infrastructure/drizzle-calendar.store';
import { ForexFactorySource } from './infrastructure/forex-factory.source';

@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [
    { provide: EconomicCalendar, inject: [DB], useFactory: (db: Database) => new EconomicCalendar(new ForexFactorySource(), new DrizzleCalendarStore(db),
      { now: Date.now, id: e => createHash('sha1').update(`${e.country}|${e.title}|${e.at}`).digest('hex') }) },
    { provide: CalendarJob, inject: [JobScheduler, EconomicCalendar], useFactory: (scheduler: JobScheduler, calendar: EconomicCalendar) => new CalendarJob(scheduler, calendar) },
  ],
  exports: [EconomicCalendar],
})
export class CalendarModule {}
