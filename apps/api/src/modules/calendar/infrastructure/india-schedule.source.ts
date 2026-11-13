import { Logger } from '@nestjs/common';
import type { SourceClient, SourceDescriptor } from '../../../shared/sources';
import type { EventSource, RawEvent } from '../application/calendar';
import type { ScheduleDiscovery } from '../application/ports/schedule-discovery';
import { INDIA_SCHEDULE, type ScheduledRelease } from '../domain/india-schedule';

const DAY = 86_400_000;
const logger = new Logger('IndiaSchedule');

export const RBI_DESCRIPTOR: SourceDescriptor = {
  id: 'rbi', owner: 'calendar', kind: 'release schedule', markets: ['india'], envKeys: [], rateLimit: { requests: 1, windowSec: 86_400 }, schedule: 'static',
  terms: 'RBI MPC decision dates vendored in the repo from the official published calendar; no request is made to the site.',
  docs: 'https://www.rbi.org.in/',
};
export const MOSPI_DESCRIPTOR: SourceDescriptor = {
  id: 'mospi', owner: 'calendar', kind: 'release schedule', markets: ['india'], envKeys: [], rateLimit: { requests: 4, windowSec: 10_800 }, schedule: '7 */3 * * *',
  terms: 'MoSPI Advance Release Calendar: the PDF named by the site\'s own latest-calendar pointer, read when it changes; the vendored dates are the fallback when it cannot be read.',
  docs: 'https://www.mospi.gov.in/release-calendar',
};

const istMonth = (at: string): string => new Date(Date.parse(at) + 5.5 * 3_600_000).toISOString().slice(0, 7);

/** The discovered list wins; a vendored MoSPI release survives only when the discovered list has none of that kind in the same month. */
function mergeSchedules(vendored: readonly ScheduledRelease[], discovered: readonly ScheduledRelease[]): ScheduledRelease[] {
  const covered = new Set(discovered.map(r => `${r.title}|${istMonth(r.at)}`));
  return [...vendored.filter(r => r.title.startsWith('RBI') || !covered.has(`${r.title}|${istMonth(r.at)}`)), ...discovered];
}

/** India's official scheduled releases (RBI MPC, MoSPI) that fall within the window around now. */
export class IndiaScheduleSource implements EventSource {
  constructor(private readonly now: () => number = Date.now, private readonly pastDays = 1, private readonly aheadDays = 90, private readonly client?: SourceClient,
    private readonly mospi?: ScheduleDiscovery) {}

  async fetch(signal: AbortSignal = AbortSignal.timeout(60_000)): Promise<RawEvent[]> {
    const from = this.now() - this.pastDays * DAY;
    const to = this.now() + this.aheadDays * DAY;
    const discovered = await this.discover(signal);
    const schedule = discovered ? mergeSchedules(INDIA_SCHEDULE, discovered) : INDIA_SCHEDULE;
    await this.recordUpcoming(schedule, discovered);
    return schedule.flatMap(r => {
      const at = Date.parse(r.at);
      return at >= from && at <= to ? [{ title: r.title, country: 'INR', at: new Date(at).toISOString(), impact: r.impact, forecast: null, previous: null }] : [];
    }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  /** Null when there is no discovery or it failed; the failure is already in the source's health (the client records it), and the vendored dates carry on. */
  private async discover(signal: AbortSignal): Promise<ScheduledRelease[] | null> {
    if (!this.mospi) return null;
    try { return await this.mospi.discover(signal); } catch (error) {
      logger.warn({ message: 'MoSPI calendar discovery failed, using the vendored dates', error: error instanceof Error ? error.message : 'unknown' });
      return null;
    }
  }

  // Zero upcoming releases means the schedule has run out; for MoSPI the count is what discovery found, so a vendored fallback does not hide a broken discovery.
  private async recordUpcoming(schedule: readonly ScheduledRelease[], discovered: readonly ScheduledRelease[] | null): Promise<void> {
    if (!this.client) return;
    const upcoming = (list: readonly ScheduledRelease[]): ScheduledRelease[] => list.filter(r => Date.parse(r.at) >= this.now());
    await this.client.recordItems(RBI_DESCRIPTOR.id, upcoming(schedule).filter(r => r.title.startsWith('RBI')).length);
    if (discovered) await this.client.recordItems(MOSPI_DESCRIPTOR.id, upcoming(discovered).length);
    else if (!this.mospi) await this.client.recordItems(MOSPI_DESCRIPTOR.id, upcoming(schedule).filter(r => !r.title.startsWith('RBI')).length);
  }
}
