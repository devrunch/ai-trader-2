import { createHash } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { DB, type Database } from '../../shared/database';
import { JobScheduler } from '../../shared/jobs';
import { SourceClient, SourceRegistry } from '../../shared/sources';
import { AuthModule } from '../auth/auth.module';
import { Universes } from '../instruments/application/index';
import { UniversesModule } from '../instruments/universes.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { MinuteBars } from '../market-data/application';
import { Logger } from '@nestjs/common';
import { CalendarController } from './api/calendar.controller';
import { CaptureActuals } from './application/capture-actuals';
import { EventActualsJob } from './infrastructure/event-actuals.job';
import { EventSpecs, FF_EVENT_SPECS_DESCRIPTOR } from './infrastructure/sources/ff-event-specs.source';
import { FRED_DESCRIPTOR, FredActuals } from './infrastructure/sources/fred.source';
import { MospiCalendar } from './infrastructure/sources/mospi.source';
import { RBI_ACTUALS_DESCRIPTOR, RbiActuals } from './infrastructure/sources/rbi-actuals.source';
import { CaptureReactions } from './application/capture-reactions';
import { EconomicCalendar } from './application/calendar';
import { EventScorecards } from './application/event-scorecards';
import { MergedSource } from './application/merged-source';
import { CalendarJob } from './infrastructure/calendar.job';
import { DrizzleCalendarStore } from './infrastructure/drizzle-calendar.store';
import { DrizzleReactionStore } from './infrastructure/drizzle-reaction.store';
import { EventReactionsJob } from './infrastructure/event-reactions.job';
import { EIA_DESCRIPTOR, EiaSource } from './infrastructure/eia.source';
import { FF_WEEKLY_DESCRIPTOR, ForexFactorySource } from './infrastructure/forex-factory.source';
import { IndiaScheduleSource, MOSPI_DESCRIPTOR, RBI_DESCRIPTOR } from './infrastructure/india-schedule.source';
import { TWELVE_DATA_EARNINGS_DESCRIPTOR, TwelveDataEarningsSource } from './infrastructure/twelve-data-earnings.source';

const CALENDAR_SOURCE_DESCRIPTORS = Symbol('CALENDAR_SOURCE_DESCRIPTORS');
const logger = new Logger('Calendar');

@Module({
  imports: [AuthModule, MarketDataModule, UniversesModule],
  controllers: [CalendarController],
  providers: [
    { provide: CALENDAR_SOURCE_DESCRIPTORS, inject: [SourceRegistry], useFactory: (registry: SourceRegistry) => { registry.register(FF_WEEKLY_DESCRIPTOR, RBI_DESCRIPTOR, MOSPI_DESCRIPTOR, EIA_DESCRIPTOR, TWELVE_DATA_EARNINGS_DESCRIPTOR, FF_EVENT_SPECS_DESCRIPTOR, FRED_DESCRIPTOR, RBI_ACTUALS_DESCRIPTOR); return true; } },
    { provide: EconomicCalendar, inject: [DB, SourceClient, APP_CONFIG, Universes, CALENDAR_SOURCE_DESCRIPTORS], useFactory: (db: Database, client: SourceClient, config: AppConfig, universes: Universes) => new EconomicCalendar(new MergedSource([new ForexFactorySource(client), new IndiaScheduleSource(Date.now, 1, 90, client, new MospiCalendar(client)), new EiaSource(client), new TwelveDataEarningsSource(client, config.TWELVE_DATA_API_KEY, universes)]), new DrizzleCalendarStore(db),
      { now: Date.now, id: e => createHash('sha1').update(`${e.country}|${e.title}|${e.at}`).digest('hex') }, EventSpecs.fromFile()) },
    { provide: CalendarJob, inject: [JobScheduler, EconomicCalendar], useFactory: (scheduler: JobScheduler, calendar: EconomicCalendar) => new CalendarJob(scheduler, calendar) },
    { provide: DrizzleReactionStore, inject: [DB], useFactory: (db: Database) => new DrizzleReactionStore(db) },
    { provide: EventScorecards, inject: [DrizzleReactionStore], useFactory: (store: DrizzleReactionStore) => { const specs = EventSpecs.fromFile(); return new EventScorecards(store, (country, title) => specs.lookup(country, title)); } },
    { provide: CaptureActuals, inject: [DB, SourceClient, APP_CONFIG, CALENDAR_SOURCE_DESCRIPTORS], useFactory: (db: Database, client: SourceClient, config: AppConfig) =>
      new CaptureActuals([new FredActuals(client, config.FRED_API_KEY), new RbiActuals(client)], new DrizzleCalendarStore(db), { now: Date.now, log: (message, data) => { logger.warn({ message, ...data }); } }) },
    { provide: EventActualsJob, inject: [JobScheduler, CaptureActuals], useFactory: (scheduler: JobScheduler, capture: CaptureActuals) => new EventActualsJob(scheduler, capture) },
    { provide: CaptureReactions, inject: [DrizzleReactionStore, MinuteBars], useFactory: (store: DrizzleReactionStore, bars: MinuteBars) => new CaptureReactions(store, bars) },
    { provide: EventReactionsJob, inject: [JobScheduler, CaptureReactions], useFactory: (scheduler: JobScheduler, capture: CaptureReactions) => new EventReactionsJob(scheduler, capture) },
  ],
  exports: [EconomicCalendar, EventScorecards],
})
export class CalendarModule {}
