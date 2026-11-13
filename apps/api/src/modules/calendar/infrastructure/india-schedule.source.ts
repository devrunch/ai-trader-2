import type { SourceClient, SourceDescriptor } from '../../../shared/sources';
import type { EventSource, RawEvent } from '../application/calendar';
import { INDIA_SCHEDULE } from '../domain/india-schedule';

const DAY = 86_400_000;

const staticSource = (id: string, what: string): SourceDescriptor => ({
  id, owner: 'calendar', kind: 'release schedule', markets: ['india'], envKeys: [], rateLimit: { requests: 1, windowSec: 86_400 }, schedule: 'static',
  terms: `${what} dates vendored in the repo from the official published calendar; no request is made to the site.`,
  docs: id === 'rbi' ? 'https://www.rbi.org.in/' : 'https://www.mospi.gov.in/',
});
export const RBI_DESCRIPTOR = staticSource('rbi', 'RBI MPC decision');
export const MOSPI_DESCRIPTOR = staticSource('mospi', 'MoSPI CPI, IIP and GDP release');

/** India's official scheduled releases (RBI MPC, MoSPI) that fall within the window around now. */
export class IndiaScheduleSource implements EventSource {
  constructor(private readonly now: () => number = Date.now, private readonly pastDays = 1, private readonly aheadDays = 90, private readonly client?: SourceClient) {}

  async fetch(): Promise<RawEvent[]> {
    const from = this.now() - this.pastDays * DAY;
    const to = this.now() + this.aheadDays * DAY;
    await this.recordUpcoming();
    return INDIA_SCHEDULE.flatMap(r => {
      const at = Date.parse(r.at);
      return at >= from && at <= to ? [{ title: r.title, country: 'INR', at: new Date(at).toISOString(), impact: r.impact, forecast: null, previous: null }] : [];
    }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  // Zero upcoming releases means the vendored schedule has run out and needs updating.
  private async recordUpcoming(): Promise<void> {
    if (!this.client) return;
    const upcoming = INDIA_SCHEDULE.filter(r => Date.parse(r.at) >= this.now());
    await this.client.recordItems(RBI_DESCRIPTOR.id, upcoming.filter(r => r.title.startsWith('RBI')).length);
    await this.client.recordItems(MOSPI_DESCRIPTOR.id, upcoming.filter(r => !r.title.startsWith('RBI')).length);
  }
}
