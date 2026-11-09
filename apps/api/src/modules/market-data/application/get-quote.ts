import type { QuoteResponse } from '@aitrader/contracts';
import { NotFoundError } from '../../../shared/errors';
import { InstrumentId } from '../../instruments/application/index';
import { calendarFor } from '../domain/calendar';
import { addDaysToDate, dateAt } from '../domain/calendars/time';
import type { MarketDataService } from './market-data.service';
import type { CandleStore } from './ports/candle-store';
import type { FormingBarStore } from './ports/forming-bar-store';

const LOOKBACK_DAYS = 14;
const QUOTE_TIMEOUT_MS = 10_000;

// Price is the forming bar when newer than the last stored bar; change is against the previous session's last close.
export class GetQuote {
  constructor(private readonly market: Pick<MarketDataService, 'bars'>, private readonly store: Pick<CandleStore, 'range1m'>,
    private readonly forming: Pick<FormingBarStore, 'get'>) {}

  async execute(instrumentId: string): Promise<QuoteResponse> {
    const latest = await this.market.bars(instrumentId, '1', { latest: true }, 1);
    const signal = AbortSignal.timeout(QUOTE_TIMEOUT_MS);
    const forming = await this.forming.get(latest.resolvedId, signal);
    const stored = latest.bars.at(-1);
    const last = forming && (!stored || forming.bar.time >= stored.time) ? forming.bar : stored;
    if (!last) throw new NotFoundError('No price yet for this instrument', { id: instrumentId, ...statusDetails(latest.status) });
    const previous = await this.previousClose(latest.resolvedId, last.time, signal);
    const change = previous === null ? null : last.close - previous;
    return {
      instrumentId, resolvedId: latest.resolvedId, price: last.close, at: last.time, status: latest.status,
      change, changePct: change === null || previous === 0 || previous === null ? null : (change / previous) * 100,
    };
  }

  private async previousClose(resolvedId: string, lastTime: number, signal: AbortSignal): Promise<number | null> {
    const calendar = calendarFor(InstrumentId.parse(resolvedId).exchange);
    let date = dateAt(lastTime, calendar.timezone);
    for (let i = 0; i < LOOKBACK_DAYS; i++) {
      date = addDaysToDate(date, -1);
      const sessions = calendar.sessionsOn(date);
      const first = sessions[0];
      const final = sessions.at(-1);
      if (!first || !final) continue;
      const bars = await this.store.range1m(resolvedId, first.open, final.close, signal);
      return bars.at(-1)?.close ?? null;
    }
    return null;
  }
}

function statusDetails(status: QuoteResponse['status']): Record<string, unknown> {
  return status.state === 'stale' ? { reason: status.reason } : {};
}
