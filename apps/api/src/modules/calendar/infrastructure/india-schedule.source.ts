import type { EventSource, RawEvent } from '../application/calendar';
import { INDIA_SCHEDULE } from '../domain/india-schedule';

const DAY = 86_400_000;

/** India's official scheduled releases (RBI MPC, MoSPI) that fall within the window around now. */
export class IndiaScheduleSource implements EventSource {
  constructor(private readonly now: () => number = Date.now, private readonly pastDays = 1, private readonly aheadDays = 90) {}

  fetch(): Promise<RawEvent[]> {
    const from = this.now() - this.pastDays * DAY;
    const to = this.now() + this.aheadDays * DAY;
    return Promise.resolve(INDIA_SCHEDULE.flatMap(r => {
      const at = Date.parse(r.at);
      return at >= from && at <= to ? [{ title: r.title, country: 'INR', at: new Date(at).toISOString(), impact: r.impact, forecast: null, previous: null }] : [];
    }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));
  }
}
