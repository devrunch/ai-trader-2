import { createHash } from 'node:crypto';
import { Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database';
import { JobScheduler } from '../../shared/jobs';
import { SourceClient, SourceRegistry } from '../../shared/sources';
import { AuthModule } from '../auth/auth.module';
import { CalendarController } from './api/calendar.controller';
import { EconomicCalendar } from './application/calendar';
import { MergedSource } from './application/merged-source';
import { CalendarJob } from './infrastructure/calendar.job';
import { DrizzleCalendarStore } from './infrastructure/drizzle-calendar.store';
import { FF_WEEKLY_DESCRIPTOR, ForexFactorySource } from './infrastructure/forex-factory.source';
import { IndiaScheduleSource, MOSPI_DESCRIPTOR, RBI_DESCRIPTOR } from './infrastructure/india-schedule.source';

const CALENDAR_SOURCE_DESCRIPTORS = Symbol('CALENDAR_SOURCE_DESCRIPTORS');

@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [
    { provide: CALENDAR_SOURCE_DESCRIPTORS, inject: [SourceRegistry], useFactory: (registry: SourceRegistry) => { registry.register(FF_WEEKLY_DESCRIPTOR, RBI_DESCRIPTOR, MOSPI_DESCRIPTOR); return true; } },
    { provide: EconomicCalendar, inject: [DB, SourceClient, CALENDAR_SOURCE_DESCRIPTORS], useFactory: (db: Database, client: SourceClient) => new EconomicCalendar(new MergedSource([new ForexFactorySource(client), new IndiaScheduleSource(Date.now, 1, 90, client)]), new DrizzleCalendarStore(db),
      { now: Date.now, id: e => createHash('sha1').update(`${e.country}|${e.title}|${e.at}`).digest('hex') }) },
    { provide: CalendarJob, inject: [JobScheduler, EconomicCalendar], useFactory: (scheduler: JobScheduler, calendar: EconomicCalendar) => new CalendarJob(scheduler, calendar) },
  ],
  exports: [EconomicCalendar],
})
export class CalendarModule {}
