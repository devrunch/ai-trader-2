import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { CalendarQuerySchema, type EconomicEvent } from '@aitrader/contracts';
import { SessionGuard } from '../../auth/api/index';
import { EconomicCalendar } from '../application/calendar';

@Controller('v1/calendar')
@UseGuards(SessionGuard)
export class CalendarController {
  constructor(@Inject(EconomicCalendar) private readonly calendar: EconomicCalendar) {}

  @Get()
  async list(@Query() raw: unknown): Promise<{ events: EconomicEvent[] }> { return { events: await this.calendar.list(CalendarQuerySchema.parse(raw)) }; }
}
