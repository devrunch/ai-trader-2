import type { MarketCalendar, SessionWindow } from './types';
import { addDaysToDate, dateAt } from './time';

export class SessionCalendar implements MarketCalendar {
  constructor(readonly id: string, readonly timezone: string, private readonly windows: (date: string) => SessionWindow[]) {}

  sessionsOn(date: string): SessionWindow[] { return this.windows(date).map(window => ({ ...window })); }

  isOpen(at: number): boolean { return this.sessionContaining(at) !== null; }

  sessionContaining(at: number): SessionWindow | null {
    return this.sessionsOn(dateAt(at, this.timezone)).find(window => at >= window.open && at < window.close) ?? null;
  }

  nextOpen(at: number): number | null {
    const date = dateAt(at, this.timezone);
    const limit = at + 14 * 86400000;
    for (let day = 0; day <= 14; day++) {
      const next = this.sessionsOn(addDaysToDate(date, day)).find(window => window.open >= at && window.open <= limit);
      if (next) return next.open;
    }
    return null;
  }
}
