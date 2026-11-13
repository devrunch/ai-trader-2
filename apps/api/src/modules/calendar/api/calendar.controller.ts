import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { CalendarQuerySchema, ScorecardQuerySchema, type EconomicEvent, type EventScorecard } from '@aitrader/contracts';
import { SessionGuard } from '../../auth/api/index';
import { EconomicCalendar } from '../application/calendar';
import { EventScorecards } from '../application/event-scorecards';

@Controller('v1/calendar')
@UseGuards(SessionGuard)
export class CalendarController {
  constructor(@Inject(EconomicCalendar) private readonly calendar: EconomicCalendar, @Inject(EventScorecards) private readonly scorecards: EventScorecards) {}

  @Get()
  async list(@Query() raw: unknown): Promise<{ events: EconomicEvent[] }> { return { events: await this.scorecards.withReactions(await this.calendar.list(CalendarQuerySchema.parse(raw))) }; }

  @Get('scorecard')
  async scorecard(@Query() raw: unknown): Promise<EventScorecard> {
    const q = ScorecardQuerySchema.parse(raw);
    return await this.scorecards.get(q) ?? { title: q.title, country: q.country ?? '', spec: null, releases: [], stats: [] };
  }
}
