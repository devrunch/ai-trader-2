import type { EconomicCalendar } from '../../calendar/application/index';
import type { PaperMarket } from '../application/ports/paper-market';
import type { ReleaseWindows } from '../application/paper-settings';

const CACHE_MS = 60_000;

/**
 * High-impact releases from the economic calendar that move an instrument: its own currency's, and for a forex pair or metal both legs'.
 * The calendar keeps the last six hours and the day ahead, which covers every order the matcher still walks.
 */
export class CalendarReleaseWindows implements ReleaseWindows {
  private cache: { at: number; events: Array<{ currency: string; at: number }> } | null = null;

  constructor(private readonly calendar: Pick<EconomicCalendar, 'list'>, private readonly market: Pick<PaperMarket, 'instrument'>, private readonly now: () => number) {}

  async near(instrumentId: string, from: number, to: number): Promise<number[]> {
    const instrument = await this.market.instrument(instrumentId);
    const ticker = instrumentId.slice(instrumentId.indexOf(':') + 1);
    const currencies = new Set([instrument.currency]);
    if ((instrument.type === 'forex' || instrument.type === 'metal') && /^[A-Z]{6}$/.test(ticker)) { currencies.add(ticker.slice(0, 3)); currencies.add(ticker.slice(3)); }
    const events = await this.events();
    return events.filter(e => currencies.has(e.currency) && e.at >= from && e.at <= to).map(e => e.at);
  }

  private async events(): Promise<Array<{ currency: string; at: number }>> {
    const now = this.now();
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.events;
    const events = (await this.calendar.list({ days: 1, impact: 'High' })).map(e => ({ currency: e.country, at: Date.parse(e.at) }));
    this.cache = { at: now, events };
    return events;
  }
}
