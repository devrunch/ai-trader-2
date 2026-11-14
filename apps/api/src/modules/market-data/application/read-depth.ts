import type { Depth, DepthResponse } from '@aitrader/contracts';
import { isMarketOpen } from './market-hours';
import type { DepthStore } from './ports/depth-store';
import type { FeedStateStore } from './ports/feed-state-store';
import type { RequestSubscription } from './request-subscription';
import { vendorFor } from './vendor-for';

const HOLD_MS = 60_000;
const READ_TIMEOUT_MS = 5000;
const none = (unavailable: string): DepthResponse => ({ depth: null, unavailable });

/** Reads the latest book; with the market closed, the last book of the session; when there is none, says why. Reading also asks for the instrument's feed, kept for a minute after the last read. */
export class ReadDepth {
  private readonly holds = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly store: DepthStore, private readonly feeds: FeedStateStore,
    private readonly subscriptions: Pick<RequestSubscription, 'acquire' | 'release'>, private readonly clock: () => number = Date.now,
    private readonly snapshot?: { fetch(instrumentId: string, signal: AbortSignal): Promise<Depth | null> }) {}

  async execute(instrumentId: string): Promise<DepthResponse> {
    const vendor = vendorFor(instrumentId);
    if (vendor === undefined || vendor === 'us-delayed') return none('No order book for this instrument');
    await this.hold(instrumentId);
    const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
    try {
      const depth = await this.store.get(instrumentId, signal);
      if (depth) return { depth, unavailable: null };
      if (!isMarketOpen(instrumentId.split(':')[0] ?? '', this.clock())) {
        const last = await this.store.last(instrumentId, signal) ?? await this.snapshot?.fetch(instrumentId, signal).catch(() => null) ?? null;
        return last ? { depth: last, unavailable: null } : none('Market closed');
      }
      const feed = await this.feeds.get(vendor, signal);
      return none(feed.state === 'live' ? 'Not subscribed yet' : 'Feed down');
    } catch { return none('Order book temporarily unavailable'); }
  }

  private async hold(instrumentId: string): Promise<void> {
    const existing = this.holds.get(instrumentId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.holds.delete(instrumentId);
      void this.subscriptions.release(instrumentId).catch(() => undefined); // an unreleased lease expires on its own
    }, HOLD_MS);
    timer.unref();
    this.holds.set(instrumentId, timer);
    if (existing) return;
    try { await this.subscriptions.acquire(instrumentId); }
    catch { clearTimeout(timer); this.holds.delete(instrumentId); } // the reason below then reads "not subscribed yet"
  }
}
