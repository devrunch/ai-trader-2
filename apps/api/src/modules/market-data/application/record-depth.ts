import { buildDepth } from '../domain/depth';
import type { DepthStore } from './ports/depth-store';
import type { LiveFeed, Tick } from './ports/live-feed';

interface Options { clock: () => number; log: (reason: string, error: unknown) => void; minGapMs?: number }

/** Keeps the latest order book of every ticking instrument in the store, at most one write per instrument per gap (default 500 ms). */
export class RecordDepth {
  private readonly lastWrite = new Map<string, number>();
  constructor(private readonly store: DepthStore, private readonly deps: Options) {}

  attach(feed: Pick<LiveFeed, 'name' | 'onTick'>): () => void {
    const off = feed.onTick(tick => { this.record(tick, feed.name); });
    return () => { off(); this.lastWrite.clear(); };
  }

  private record(tick: Tick, source: string): void {
    if (!tick.book) return;
    const now = this.deps.clock();
    if (now - (this.lastWrite.get(tick.instrumentId) ?? -Infinity) < (this.deps.minGapMs ?? 500)) return;
    const depth = buildDepth({ instrumentId: tick.instrumentId, at: tick.at, source, ...tick.book });
    if (depth.bids.length === 0 && depth.asks.length === 0) return;
    this.lastWrite.set(tick.instrumentId, now);
    // A failed write is dropped: the next tick writes a fresher book (idempotent overwrite).
    void this.store.set(tick.instrumentId, depth, AbortSignal.timeout(3000)).catch((error: unknown) => { this.deps.log('depth write failed', error); });
  }
}
