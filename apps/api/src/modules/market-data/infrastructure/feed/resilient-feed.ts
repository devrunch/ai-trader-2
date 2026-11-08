import { backoffDelay, sleep, withTimeout } from '@aitrader/resilience';
import type { FeedState, LiveFeed, Tick } from '../../application/ports/live-feed';

export interface FeedTransport {
  connect(signal: AbortSignal): Promise<void>;
  close(): void;
  sendSubscribe(vendorKeys: readonly string[]): void;
  sendUnsubscribe(vendorKeys: readonly string[]): void;
  onMessage(cb: (ticks: Tick[]) => void): void;
  onClose(cb: (reason: string) => void): void;
}
interface Dependencies {
  clock: () => number;
  isOpen: (id: string, at: number) => boolean;
  backfill: (id: string, from: number, to: number, signal: AbortSignal) => Promise<void>;
  resolveKey: (id: string) => string | null | Promise<string | null>;
  releaseKey?: (key: string) => void;
  backoff?: { baseMs: number; maxMs: number; random?: () => number };
  watchdogMs?: number;
  graceMs?: number;
  connectTimeoutMs?: number;
  refreshAuth?: (signal: AbortSignal) => Promise<void>;
  log: (reason: string, error: unknown) => void;
}
interface Subscription { key: string; count: number; lastTickAt?: number; grace?: ReturnType<typeof setTimeout> }

export class ResilientFeed implements LiveFeed {
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly ticks = new Set<(t: Tick) => void>();
  private readonly states = new Set<(s: FeedState, reason?: string) => void>();
  private controller?: AbortController;
  private transport: FeedTransport | undefined;
  private running: Promise<void> | undefined;
  private opened: (() => void) | undefined;
  private disconnected?: (reason: string) => void;
  private watchdog?: ReturnType<typeof setInterval>;
  private state: FeedState = 'stopped';
  private lastMessage = 0;
  private quietSince: number | undefined;
  private readonly failedBackfills = new Map<string, { from: number; to: number }>();

  constructor(readonly name: 'kite' | 'deriv', private readonly factory: () => FeedTransport, private readonly deps: Dependencies) {}

  async subscribe(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      const current = this.subscriptions.get(id);
      if (current) { clearTimeout(current.grace); delete current.grace; current.count++; continue; }
      const key = await this.deps.resolveKey(id);
      if (key === null) throw new Error(`UNSUPPORTED: ${id}`);
      // Concurrent subscribers share one vendor subscription.
      const raced = this.subscriptions.get(id);
      if (raced) { clearTimeout(raced.grace); delete raced.grace; raced.count++; continue; }
      this.subscriptions.set(id, { key, count: 1 });
      if (this.state === 'live') this.transport?.sendSubscribe([key]);
    }
  }
  unsubscribe(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      const sub = this.subscriptions.get(id);
      if (!sub || sub.count === 0 || --sub.count > 0) continue;
      sub.grace = setTimeout(() => {
        this.subscriptions.delete(id);
        if (this.state === 'live') this.transport?.sendUnsubscribe([sub.key]);
        this.deps.releaseKey?.(sub.key);
      }, this.deps.graceMs ?? 60000);
    }
    return Promise.resolve();
  }
  onTick(listener: (t: Tick) => void): () => void { this.ticks.add(listener); return () => { this.ticks.delete(listener); }; }
  onState(listener: (s: FeedState, reason?: string) => void): () => void { this.states.add(listener); return () => { this.states.delete(listener); }; }
  async retryBackfills(signal: AbortSignal): Promise<void> {
    for (const [id, window] of this.failedBackfills) {
      signal.throwIfAborted();
      try {
        await withTimeout(s => this.deps.backfill(id, window.from, window.to, s), 120000, signal);
        if (this.failedBackfills.get(id) === window) this.failedBackfills.delete(id);
      } catch (error) { signal.throwIfAborted(); this.deps.log(`nightly backfill failed: ${id}`, error); }
    }
  }
  start(): Promise<void> {
    if (this.running) return Promise.resolve();
    this.controller = new AbortController();
    const ready = new Promise<void>(resolve => { this.opened = resolve; });
    this.watchdog = setInterval(() => { this.checkSilence(); }, Math.min(1000, this.deps.watchdogMs ?? 30000));
    this.running = this.recover(this.controller.signal).catch((error: unknown) => {
      if (!this.controller?.signal.aborted) this.deps.log('feed recovery failed', error);
    });
    return ready;
  }
  async stop(): Promise<void> {
    this.controller?.abort(); clearInterval(this.watchdog);
    for (const [id, sub] of this.subscriptions) {
      clearTimeout(sub.grace);
      if (sub.count === 0) { this.subscriptions.delete(id); this.deps.releaseKey?.(sub.key); }
    }
    this.disconnected?.('stopped'); this.transport?.close();
    await this.running; this.running = undefined; this.transport = undefined;
    this.opened?.(); this.opened = undefined; this.emit('stopped');
  }
  private emit(state: FeedState, reason?: string): void {
    this.state = state;
    for (const listener of this.states) listener(state, reason);
  }
  // One recovery owner serializes opens, auth refresh and jittered retries until cancellation.
  private async recover(signal: AbortSignal): Promise<void> {
    let attempt = 0; let outage: number | undefined; let reason: string | undefined;
    while (!signal.aborted) {
      if (reason !== undefined) {
        if (reason === 'AUTH_EXPIRED') this.emit('stale', reason);
        else this.emit('reconnecting', reason);
        await sleep(backoffDelay(attempt++, this.deps.backoff ?? { baseMs: 500, maxMs: 30000 }), signal);
      } else this.emit('connecting');
      const transport = this.factory(); this.transport = transport;
      let liveAt: number | undefined;
      const closed = new Promise<string>(resolve => { this.disconnected = resolve; });
      transport.onClose(value => { if (this.transport === transport) this.disconnected?.(value); });
      transport.onMessage(values => { if (this.transport === transport && this.state === 'live') this.receive(values); });
      try {
        if (reason === 'AUTH_EXPIRED') await withTimeout(s => this.deps.refreshAuth?.(s) ?? Promise.resolve(), 120000, signal);
        await withTimeout(s => transport.connect(s), this.deps.connectTimeoutMs ?? 15000, signal);
        signal.throwIfAborted();
        transport.sendSubscribe([...this.subscriptions.values()].map(sub => sub.key));
        liveAt = this.deps.clock(); this.lastMessage = liveAt; this.quietSince = undefined;
        this.emit('live'); this.opened?.(); this.opened = undefined;
        if (outage !== undefined) this.repair(outage, liveAt, signal);
        reason = await closed;
      } catch (error) {
        if (this.cancelled(signal)) break;
        reason = error instanceof Error ? error.message : 'PROVIDER_DOWN';
        this.deps.log('feed connection failed', error);
      } finally { this.transport = undefined; transport.close(); }
      if (this.cancelled(signal)) break;
      if (liveAt !== undefined && this.deps.clock() - liveAt >= 60000) attempt = 0;
      outage = liveAt === undefined ? outage ?? this.deps.clock() : this.deps.clock();
    }
  }
  private cancelled(signal: AbortSignal): boolean { return signal.aborted; }
  private receive(values: Tick[]): void {
    for (const tick of values) {
      const sub = this.subscriptions.get(tick.instrumentId);
      if (!sub) continue;
      this.lastMessage = this.deps.clock(); this.quietSince = undefined;
      sub.lastTickAt = Math.max(sub.lastTickAt ?? -Infinity, tick.at);
      for (const listener of this.ticks) listener(tick);
    }
  }
  private checkSilence(): void {
    if (this.state !== 'live') return;
    const now = this.deps.clock();
    if (![...this.subscriptions.keys()].some(id => this.deps.isOpen(id, now))) { this.quietSince = now; return; }
    const since = Math.max(this.lastMessage, this.quietSince ?? this.lastMessage);
    if (now - since < (this.deps.watchdogMs ?? 30000)) return;
    this.emit('reconnecting', 'watchdog'); this.disconnected?.('watchdog');
  }
  private repair(from: number, to: number, signal: AbortSignal): void {
    for (const [id, sub] of this.subscriptions) {
      // Check each minute, including both endpoints, for outages crossing a session boundary.
      let open = this.deps.isOpen(id, to);
      for (let at = from; !open && at <= to; at += 60000) open = this.deps.isOpen(id, at);
      const start = sub.lastTickAt ?? from;
      if (open) void withTimeout(s => this.deps.backfill(id, start, to, s), 120000, signal)
        .catch((error: unknown) => {
          const prior = this.failedBackfills.get(id);
          this.failedBackfills.set(id, { from: Math.min(prior?.from ?? start, start), to: Math.max(prior?.to ?? to, to) });
          this.deps.log(`backfill failed: ${id}; queued for nightly retry`, error);
        });
    }
  }
}
