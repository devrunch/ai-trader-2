import { LiveAckSchema, LiveBarSchema, LiveResyncSchema, LiveSnapshotSchema, LiveStatusSchema, type Bar, type DataStatus, type Interval } from '@aitrader/contracts';
import { backoffDelay } from '@aitrader/resilience';
import { setConnection } from './connection-store';
import { ServerClock } from './server-clock';
import { SeriesSync } from './series-sync';

export interface SocketLike {
  readonly connected: boolean;
  on(event: string, fn: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  connect(): void;
  disconnect(): void;
}
export interface SeriesHandlers { onReset(bars: Bar[]): void; onUpdate(bar: Bar): void; onStatus(status: DataStatus): void }
export interface LiveClientDeps {
  socket: SocketLike;
  store: { set(key: string, value: number): void };
  clock?: ServerClock;
  doc?: EventTarget & { visibilityState: DocumentVisibilityState };
  win?: EventTarget & { navigator: { onLine: boolean } };
  random?: () => number;
}

interface Series {
  symbol: string; interval: Interval; handlers: Set<SeriesHandlers>; sync: SeriesSync;
  id: string | undefined; instrumentId?: string; status?: DataStatus; lastEventAt: number; resyncQueued: boolean; staleGuarded: boolean;
}

const HIDDEN_RESYNC_MS = 5_000;
const WAKE_TICK_MS = 15_000;
const WAKE_LATE_MS = 30_000;
const STALE_MS = 90_000;
const CLOCK_SYNC_MS = 10 * 60_000;
const ORPHAN_TTL_MS = 10_000;

/**
 * The browser's one live connection (FR-LS-3/4). It reconnects with jittered backoff, resubscribes every series
 * with `afterSeq` after any drop, gap, wake-up, tab return or network return, and never lets a tick touch React state.
 */
export class LiveClient {
  private readonly series = new Map<string, Series>();
  private readonly byId = new Map<string, Series>();
  private readonly orphans = new Map<string, { at: number; events: Array<[string, unknown]> }>();
  private readonly clock: ServerClock;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private hiddenAt: number | undefined;
  private lastTick = Date.now();
  private unauthorized = false;

  constructor(private readonly deps: LiveClientDeps) { this.clock = deps.clock ?? new ServerClock(); }

  start(): void {
    const { socket, doc, win } = this.deps;
    socket.on('connect', () => { this.onConnect(); });
    socket.on('disconnect', () => { this.scheduleReconnect(); });
    socket.on('connect_error', (error: unknown) => { this.onConnectError(error); });
    socket.on('session_expired', () => { this.unauthorized = true; setConnection({ state: 'unauthorized' }); });
    for (const event of ['snapshot', 'bar', 'status', 'resync']) socket.on(event, (payload: unknown) => { this.route(event, payload); });
    doc?.addEventListener('visibilitychange', () => { this.onVisibility(); });
    win?.addEventListener('online', () => { this.onOnline(); });
    win?.addEventListener('offline', () => { setConnection({ state: 'offline' }); });
    this.timers.push(setInterval(() => { this.tick(); }, WAKE_TICK_MS));
    this.timers.push(setInterval(() => { void this.syncClock(); }, CLOCK_SYNC_MS));
    setConnection({ state: 'connecting' });
    socket.connect();
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    clearTimeout(this.reconnectTimer);
    this.deps.socket.disconnect();
  }

  serverNow(): number { return this.clock.now(); }

  subscribe(symbol: string, interval: Interval, handlers: SeriesHandlers): () => void {
    const key = `${symbol}|${interval}`;
    let entry = this.series.get(key);
    if (!entry) {
      const created: Series = { symbol, interval, handlers: new Set(), id: undefined, lastEventAt: Date.now(), resyncQueued: false, staleGuarded: false,
        sync: new SeriesSync({ onReset: bars => { for (const h of created.handlers) h.onReset(bars); },
          onUpdate: bar => { this.price(created, bar); for (const h of created.handlers) h.onUpdate(bar); } }) };
      entry = created;
      this.series.set(key, entry);
      if (this.deps.socket.connected) this.send(entry);
    }
    entry.handlers.add(handlers);
    const target = entry;
    return () => {
      target.handlers.delete(handlers);
      if (target.handlers.size > 0) return;
      this.series.delete(key);
      if (target.id) { this.byId.delete(target.id); this.deps.socket.emit('unsubscribe', { subscriptionId: target.id }); }
    };
  }

  /** Older bars a chart paged in; merged into the shared series (no-op if nobody holds it). */
  mergeHistory(symbol: string, interval: Interval, bars: readonly Bar[]): void {
    this.series.get(`${symbol}|${interval}`)?.sync.mergeHistory(bars);
  }

  private onConnect(): void {
    this.attempt = 0;
    setConnection({ state: 'live' });
    void this.syncClock();
    for (const entry of this.series.values()) this.resync(entry);
  }

  private onConnectError(error: unknown): void {
    const code = typeof error === 'object' && error !== null && 'data' in error ? (error.data as { code?: unknown } | undefined)?.code : undefined;
    if (code === 'UNAUTHORIZED') { this.unauthorized = true; clearTimeout(this.reconnectTimer); setConnection({ state: 'unauthorized' }); return; }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.unauthorized || this.reconnectTimer !== undefined) return;
    for (const entry of this.series.values()) { if (entry.id) this.byId.delete(entry.id); entry.id = undefined; }
    const delay = backoffDelay(this.attempt, { baseMs: 500, maxMs: 15_000, ...(this.deps.random ? { random: this.deps.random } : {}) });
    setConnection(this.deps.win?.navigator.onLine === false ? { state: 'offline' } : { state: 'reconnecting', attempt: this.attempt, nextAt: Date.now() + delay });
    this.attempt++;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; this.deps.socket.connect(); }, delay);
  }

  private reconnectNow(): void {
    if (this.unauthorized || this.deps.socket.connected) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.attempt = 0;
    this.deps.socket.connect();
  }

  private onVisibility(): void {
    const doc = this.deps.doc;
    if (!doc) return;
    if (doc.visibilityState === 'hidden') { this.hiddenAt = Date.now(); return; }
    const hiddenFor = this.hiddenAt === undefined ? 0 : Date.now() - this.hiddenAt;
    this.hiddenAt = undefined;
    if (hiddenFor >= HIDDEN_RESYNC_MS) this.resyncAll();
  }

  private onOnline(): void {
    if (!this.deps.socket.connected) { this.reconnectNow(); return; }
    setConnection({ state: 'live' });
    this.resyncAll();
  }

  /** Detects a wake from sleep (timers stalled) and silent subscriptions. */
  private tick(): void {
    const now = Date.now();
    const late = now - this.lastTick >= WAKE_LATE_MS;
    this.lastTick = now;
    if (late) { if (this.deps.socket.connected) this.resyncAll(); else this.reconnectNow(); return; }
    for (const entry of this.series.values()) {
      if (entry.staleGuarded || entry.status?.state !== 'ok' || now - entry.lastEventAt < STALE_MS) continue;
      entry.staleGuarded = true;
      this.resync(entry);
    }
    for (const [id, orphan] of this.orphans) if (now - orphan.at > ORPHAN_TTL_MS) this.orphans.delete(id);
  }

  private resyncAll(): void { for (const entry of this.series.values()) this.resync(entry); }

  /** Collapses every trigger in one turn into a single resubscribe per series. */
  private resync(entry: Series): void {
    if (entry.resyncQueued) return;
    entry.resyncQueued = true;
    queueMicrotask(() => {
      entry.resyncQueued = false;
      if (!this.deps.socket.connected || this.series.get(`${entry.symbol}|${entry.interval}`) !== entry) return;
      if (entry.id) { this.byId.delete(entry.id); this.deps.socket.emit('unsubscribe', { subscriptionId: entry.id }); entry.id = undefined; }
      this.send(entry);
    });
  }

  private send(entry: Series): void {
    const afterSeq = entry.sync.lastSeq();
    const request = { symbol: entry.symbol, interval: entry.interval, ...(afterSeq > 0 ? { afterSeq } : {}) };
    this.deps.socket.emit('subscribe', request, (raw: unknown) => {
      const ack = LiveAckSchema.safeParse(raw);
      if (!ack.success || !ack.data.ok) return;
      if (this.series.get(`${entry.symbol}|${entry.interval}`) !== entry) { this.deps.socket.emit('unsubscribe', { subscriptionId: ack.data.subscriptionId }); return; }
      entry.id = ack.data.subscriptionId;
      this.byId.set(entry.id, entry);
      const early = this.orphans.get(entry.id);
      this.orphans.delete(entry.id);
      for (const [event, payload] of early?.events ?? []) this.route(event, payload);
    });
  }

  private route(event: string, payload: unknown): void {
    const id = typeof payload === 'object' && payload !== null && 'subscriptionId' in payload ? payload.subscriptionId : undefined;
    if (typeof id !== 'string') return;
    const entry = this.byId.get(id);
    if (!entry) { // the server answers before the ack arrives; hold events until it does
      const orphan = this.orphans.get(id) ?? { at: Date.now(), events: [] };
      orphan.events.push([event, payload]);
      this.orphans.set(id, orphan);
      return;
    }
    entry.lastEventAt = Date.now();
    entry.staleGuarded = false;
    if (event === 'snapshot') {
      const snapshot = LiveSnapshotSchema.parse(payload);
      entry.instrumentId = snapshot.instrumentId;
      this.setStatus(entry, snapshot.status);
      entry.sync.applySnapshot(snapshot.bars, snapshot.seq);
      const last = snapshot.bars.at(-1);
      if (last) this.price(entry, last);
    } else if (event === 'bar') {
      const update = LiveBarSchema.parse(payload);
      if (entry.sync.applyBar(update.seq, update.bar) === 'gap') this.resync(entry);
    } else if (event === 'status') {
      this.setStatus(entry, LiveStatusSchema.parse(payload).status);
    } else if (LiveResyncSchema.safeParse(payload).success) {
      this.byId.delete(id);
      entry.id = undefined; // the server already dropped it
      this.resync(entry);
    }
  }

  private setStatus(entry: Series, status: DataStatus): void {
    entry.status = status;
    for (const h of entry.handlers) h.onStatus(status);
  }

  private price(entry: Series, bar: Bar): void {
    if (entry.instrumentId) this.deps.store.set(`price:${entry.instrumentId}`, bar.close);
  }

  private async syncClock(): Promise<void> {
    const socket = this.deps.socket;
    if (!socket.connected) return;
    await this.clock.sync(() => new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('time timeout')); }, 5_000);
      socket.emit('time', (raw: unknown) => {
        clearTimeout(timer);
        const now = typeof raw === 'object' && raw !== null && 'now' in raw ? raw.now : undefined;
        if (typeof now === 'number') resolve(now); else reject(new Error('bad time'));
      });
    }));
  }
}
