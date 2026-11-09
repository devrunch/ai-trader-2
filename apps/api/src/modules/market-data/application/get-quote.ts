import type { QuoteResponse } from '@aitrader/contracts';
import { NotFoundError } from '../../../shared/errors';
import { calendarForInstrument } from '../domain/calendar';
import { addDaysToDate, dateAt } from '../domain/calendars/time';
import type { MarketDataService } from './market-data.service';
import type { CandleStore } from './ports/candle-store';
import type { FormingBarStore } from './ports/forming-bar-store';
import type { PreviousCloseSource, PreviousCloseStore } from './ports/previous-close';

const LOOKBACK_DAYS = 14;
const QUOTE_TIMEOUT_MS = 10_000;

// Price is the forming bar when newer than the last stored bar; change is against the previous session's last close.
export class GetQuote {
  constructor(private readonly market: Pick<MarketDataService, 'bars'>, private readonly store: Pick<CandleStore, 'range1m'>,
    private readonly forming: Pick<FormingBarStore, 'get'>,
    private readonly official?: { store: PreviousCloseStore; source?: PreviousCloseSource }, private readonly clock: () => number = Date.now) {}

  async execute(instrumentId: string): Promise<QuoteResponse> {
    const latest = await this.market.bars(instrumentId, '1', { latest: true }, 1);
    const signal = AbortSignal.timeout(QUOTE_TIMEOUT_MS);
    const forming = await this.forming.get(latest.resolvedId, signal);
    const stored = latest.bars.at(-1);
    const last = forming && (!stored || forming.bar.time >= stored.time) ? forming.bar : stored;
    if (!last) throw new NotFoundError('No price yet for this instrument', { id: instrumentId, ...statusDetails(latest.status) });
    const previous = (await this.officialClose(latest.resolvedId, last.time, signal)) ?? await this.previousClose(latest.resolvedId, last.time, signal);
    const change = previous === null ? null : last.close - previous;
    return {
      instrumentId, resolvedId: latest.resolvedId, price: last.close, at: last.time, status: latest.status,
      change, changePct: change === null || previous === 0 || previous === null ? null : (change / previous) * 100,
    };
  }

  /** The exchange's own previous close (closing-auction price included); bars are only the fallback. */
  private async officialClose(resolvedId: string, lastTime: number, signal: AbortSignal): Promise<number | null> {
    if (!this.official) return null;
    const timezone = calendarForInstrument(resolvedId).timezone;
    const session = dateAt(lastTime, timezone);
    const stored = await this.official.store.get(resolvedId, signal).catch(() => null);
    if (stored?.forDate === session) return stored.close;
    // A fetched close is "previous to today": only valid when the quote's session is today.
    if (!this.official.source || session !== dateAt(this.clock(), timezone)) return null;
    const close = await this.official.source.fetch(resolvedId, signal).catch(() => null);
    if (close === null) return null;
    await this.official.store.set(resolvedId, close, session, signal).catch(() => undefined);
    return close;
  }

  private async previousClose(resolvedId: string, lastTime: number, signal: AbortSignal): Promise<number | null> {
    const calendar = calendarForInstrument(resolvedId);
    let date = dateAt(lastTime, calendar.timezone);
    for (let i = 0; i < LOOKBACK_DAYS; i++) {
      date = addDaysToDate(date, -1);
      const sessions = calendar.sessionsOn(date);
      const first = sessions[0];
      const final = sessions.at(-1);
      if (!first || !final) continue;
      const bars = await this.store.range1m(resolvedId, first.open, final.close, signal);
      const close = bars.at(-1)?.close;
      if (close !== undefined) return close; // a session with no stored bars (not yet backfilled) is skipped
    }
    return null;
  }
}

function statusDetails(status: QuoteResponse['status']): Record<string, unknown> {
  return status.state === 'stale' ? { reason: status.reason } : {};
}
