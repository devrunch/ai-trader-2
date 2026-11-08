import { sleep, withTimeout } from '@aitrader/resilience';
import type { FeedState, LiveFeed, Tick } from '../../application/ports/live-feed';
import type { HistoryInstruments } from '../../application/ports/history-instruments';
import type { MarketDataProvider } from '../../application/ports/market-data-provider';
import { calendarFor } from '../../domain/calendar';

interface Dependencies { provider: MarketDataProvider; instruments: HistoryInstruments; clock?: () => number }
interface Subscription { symbol: string; count: number; lastClose: number }
export class UsDelayedFeed implements LiveFeed {
  readonly name = 'us-delayed';
  readonly delayMs = 15 * 60000;
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly ticks = new Set<(tick: Tick) => void>();
  private readonly states = new Set<(state: FeedState, reason?: string) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private controller: AbortController | undefined;
  private pending: Promise<void> | undefined;
  private failures = 0;
  private cursor = 0;
  private readonly clock: () => number;
  constructor(private readonly deps: Dependencies) { this.clock = deps.clock ?? Date.now; }
  async subscribe(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      const mapping = await withTimeout(signal => this.deps.instruments.getMapping(id, 'us-delayed', signal), 5000);
      if (!mapping) throw new Error('UNSUPPORTED');
      const current = this.subscriptions.get(id);
      if (current) current.count++;
      else this.subscriptions.set(id, { symbol: mapping.providerSymbol, count: 1, lastClose: -Infinity });
    }
  }
  unsubscribe(ids: readonly string[]): Promise<void> {
    for (const id of ids) { const sub = this.subscriptions.get(id); if (sub && --sub.count === 0) this.subscriptions.delete(id); }
    return Promise.resolve();
  }
  onTick(cb: (tick: Tick) => void): () => void { this.ticks.add(cb); return () => { this.ticks.delete(cb); }; }
  onState(cb: (state: FeedState, reason?: string) => void): () => void { this.states.add(cb); return () => { this.states.delete(cb); }; }
  start(): Promise<void> {
    if (this.controller) return Promise.resolve();
    this.controller = new AbortController(); this.failures = 0; this.emit('connecting');
    const signal = this.controller.signal;
    this.timer = setInterval(() => {
      if (!this.pending) this.pending = this.poll(signal).finally(() => { this.pending = undefined; });
    }, 60000);
    return Promise.resolve();
  }
  async stop(): Promise<void> {
    clearInterval(this.timer); this.controller?.abort(); await this.pending; this.controller = undefined; this.emit('stopped');
  }
  private emit(state: FeedState, reason?: string): void { for (const cb of this.states) cb(state, reason); }
  private async poll(signal: AbortSignal): Promise<void> {
    try {
      const open = [...this.subscriptions].filter(([id]) => calendarFor(id.split(':')[0] ?? '').isOpen(this.clock()));
      if (!open.length) return;
      const batch = Array.from({ length: Math.min(10, open.length) }, (_, index) => open[(this.cursor + index) % open.length]);
      this.cursor = (this.cursor + batch.length) % open.length;
      let reason: string | undefined;
      for (const [index, entry] of batch.entries()) {
        if (!entry) continue;
        if (index) await sleep(1000, signal);
        const [id, sub] = entry;
        if (this.subscriptions.get(id) !== sub || !calendarFor(id.split(':')[0] ?? '').isOpen(this.clock())) continue;
        const now = this.clock();
        const result = await withTimeout(abort => this.deps.provider.history({ providerSymbol: sub.symbol }, '1m', now - this.delayMs - 7 * 60000, now, abort), 15000, signal);
        if (!result.ok) { reason = result.reason; continue; }
        // A monotonically increasing close timestamp deduplicates repeated polls.
        for (const bar of [...result.data].sort((a, b) => a.time - b.time)) {
          const close = bar.time + 60000;
          if (close > sub.lastClose && close <= now - this.delayMs && this.subscriptions.get(id) === sub) {
            sub.lastClose = close; for (const cb of this.ticks) cb({ instrumentId: id, at: close, price: bar.close, cumVolume: null });
          }
        }
      }
      if (reason) this.failed(reason);
      else { this.failures = 0; this.emit('live'); }
    } catch { if (!signal.aborted) this.failed('PROVIDER_DOWN'); }
  }
  private failed(reason: string): void { if (++this.failures >= 3) this.emit('stale', reason); }
}
