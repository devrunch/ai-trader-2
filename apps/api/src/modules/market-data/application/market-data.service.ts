import { InstrumentId } from '../../instruments/application/index';
import { calendarFor } from '../domain/calendar';
import type { BarsResponse, DataStatus, ProviderReason } from '@aitrader/contracts';
import { ProviderDownError, RateLimitedError, ValidationError } from '../../../shared/errors';
import type { ResolveInstrument } from '../../instruments/application/index';
import type { Interval } from '../domain/interval';
import type { BarsCursor, BarsPage, ReadBars } from './read-bars';
import type { FeedStateStore } from './ports/feed-state-store';
import { vendorFor } from './vendor-for';

const US_DELAY_MS = 15 * 60_000;
const READ_TIMEOUT_MS = 25_000;
type ReadFailure = Exclude<Awaited<ReturnType<ReadBars['execute']>>, BarsPage>;

// Every instrument reads only from its own vendor (E3); status is always reported, never guessed.
export class MarketDataService {
  constructor(private readonly resolve: Pick<ResolveInstrument, 'execute'>, private readonly read: Pick<ReadBars, 'execute'>,
    private readonly feeds: FeedStateStore, private readonly clock: () => number = Date.now) {}

  async bars(instrumentId: string, interval: Interval, cursor: BarsCursor, limit: number): Promise<BarsResponse> {
    const { instrument } = await this.resolve.execute(instrumentId);
    const resolvedId = instrument.id.toString();
    const vendor = vendorFor(resolvedId);
    const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
    const [page, feed] = await Promise.all([
      this.read.execute(resolvedId, interval, cursor, limit, signal),
      vendor === undefined ? Promise.resolve({ state: 'unknown' } as const) : this.feeds.get(vendor, signal),
    ]);
    const base = { instrumentId, resolvedId, interval };
    if (!('bars' in page)) {
      if (page.reason === 'NO_DATA' || page.reason === 'MARKET_CLOSED') {
        return { ...base, bars: [], nextBefore: null, status: stale(page.reason, page.detail) };
      }
      throw failure(page);
    }
    let status: DataStatus;
    if (!page.status.ok) status = stale(page.status.reason, page.status.detail);
    else if (feed.state === 'stale') status = stale(feed.reason ?? 'PROVIDER_DOWN');
    else if (!marketOpen(resolvedId, this.clock())) status = stale('MARKET_CLOSED');
    else if (vendor === 'us-delayed') status = { state: 'delayed', delayMs: US_DELAY_MS };
    else status = { state: 'ok' };
    return { ...base, bars: page.bars, nextBefore: page.nextBefore, status };
  }
}

function stale(reason: ProviderReason, detail?: string): DataStatus {
  return detail === undefined ? { state: 'stale', reason } : { state: 'stale', reason, detail };
}

function failure(result: ReadFailure): Error {
  const details = { reason: result.reason, ...(result.detail === undefined ? {} : { detail: result.detail }) };
  switch (result.reason) {
    case 'RATE_LIMITED': return new RateLimitedError('Market data rate limited', result.retryAfterMs ?? 1000, details);
    case 'UNSUPPORTED': return new ValidationError('Market data is not available for this instrument', details);
    default: return new ProviderDownError('Market data provider unavailable', details);
  }
}

function marketOpen(instrumentId: string, now: number): boolean {
  try { return calendarFor(InstrumentId.parse(instrumentId).exchange).isOpen(now); } catch { return true; } // unknown calendar: don't claim closed
}
