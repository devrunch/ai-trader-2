import { randomUUID } from 'node:crypto';
import type { BarUpdate } from '@aitrader/contracts';
import { LiveSubscribeSchema, LiveUnsubscribeSchema, LiveAckSchema, LiveSnapshotSchema, LiveBarSchema, LiveStatusSchema, LiveResyncSchema } from '@aitrader/contracts';
import type { LiveBar, LiveChange, LiveData, Interval } from './ports/live-data';

type Emit = (event: string, payload: unknown) => boolean;
interface Client { userId: string; emit: Emit; subscriptionIds: Set<string>; pendingSubscriptions: number; calls: number[] }
interface Subscription {
  id: string; socketId: string; instrumentId: string; interval: Interval; emit: Emit;
  buffering: boolean; pending: BarUpdate[]; rawBucket: Map<number, LiveBar>; bucket: number | undefined;
  lastSeq: number; resyncSent: boolean; unwatch: () => void;
}
type LiveAck = ReturnType<typeof LiveAckSchema.parse>;
export interface SubscriptionRef { id: string; socketId: string; instrumentId: string; interval: Interval }
/** Listens to every bar a subscription sends and to its end (unsubscribe, disconnect or resync): live indicators ride on it. */
export interface BarTap { bar(sub: SubscriptionRef, bar: LiveBar, seq: number): void; ended(subscriptionId: string): void }
const MAX_PENDING = 2000;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 20;

export class LiveSubscriptions {
  private readonly clients = new Map<string, Client>();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly byInstrument = new Map<string, Set<string>>();
  private readonly lastSeq = new Map<string, number>();
  private tap: BarTap | undefined;
  constructor(private readonly data: LiveData, private readonly clock: () => number = Date.now) {}

  attachTap(tap: BarTap): void { this.tap = tap; }

  /** The subscription's instrument and interval, if it belongs to this socket. */
  describe(socketId: string, subscriptionId: string): SubscriptionRef | null {
    const sub = this.subscriptions.get(subscriptionId);
    return sub && sub.socketId === socketId ? { id: sub.id, socketId, instrumentId: sub.instrumentId, interval: sub.interval } : null;
  }

  connect(socketId: string, userId: string, emit: Emit): boolean {
    const userSockets = [...this.clients.values()].filter(client => client.userId === userId).length;
    if (userSockets >= 10) return false;
    this.clients.set(socketId, { userId, emit, subscriptionIds: new Set(), pendingSubscriptions: 0, calls: [] });
    return true;
  }

  async subscribe(socketId: string, value: unknown): Promise<LiveAck> {
    const client = this.clients.get(socketId);
    if (!client) return failure('INVALID', 'Socket is not connected');
    if (!this.rateAllowed(client)) return failure('LIMIT', 'Subscribe rate limit exceeded');
    const parsed = LiveSubscribeSchema.safeParse(value);
    if (!parsed.success) return failure('INVALID', 'Invalid subscription');
    if (client.subscriptionIds.size + client.pendingSubscriptions >= 50) return failure('LIMIT', 'Subscription limit exceeded');
    client.pendingSubscriptions++;
    let instrumentId: string | null;
    try { instrumentId = await this.data.resolve(parsed.data.symbol); }
    catch (error) { client.pendingSubscriptions--; throw error; }
    client.pendingSubscriptions--;
    if (!instrumentId) return failure('NOT_FOUND', 'Unknown symbol');
    const id = randomUUID();
    const sub: Subscription = { id, socketId, instrumentId, interval: parsed.data.interval, emit: client.emit,
      buffering: true, pending: [], rawBucket: new Map(), bucket: undefined, lastSeq: parsed.data.afterSeq ?? 0,
      resyncSent: false, unwatch: () => undefined };
    const subs = this.byInstrument.get(instrumentId) ?? new Set<string>();
    subs.add(id); this.byInstrument.set(instrumentId, subs); this.subscriptions.set(id, sub); client.subscriptionIds.add(id);
    sub.unwatch = this.data.watch(instrumentId, change => { this.changed(sub, change); });
    try {
      await this.data.acquire(instrumentId);
      if (parsed.data.afterSeq !== undefined) {
        const replay = await this.data.replay(instrumentId, parsed.data.afterSeq);
        if (replay !== null) {
          if (sub.interval !== '1') await this.seedBucket(sub);
          for (const update of replay) this.sendUpdate(sub, update, false);
          sub.lastSeq = Math.max(parsed.data.afterSeq, replay.at(-1)?.seq ?? parsed.data.afterSeq);
          this.lastSeq.set(instrumentId, Math.max(this.lastSeq.get(instrumentId) ?? 0, sub.lastSeq));
          sub.buffering = false;
          this.flush(sub, sub.lastSeq);
          return success(id);
        }
      }
      const seq0 = await this.data.current(instrumentId);
      const [page, raw] = await Promise.all([
        this.data.read(instrumentId, sub.interval, 300),
        sub.interval === '1' ? Promise.resolve([]) : this.data.read(instrumentId, '1', 5000).then(result => result.bars),
      ]);
      if (sub.interval !== '1') this.seedFromBars(sub, raw);
      sub.lastSeq = seq0;
      this.lastSeq.set(instrumentId, Math.max(this.lastSeq.get(instrumentId) ?? 0, seq0));
      sub.emit('snapshot', LiveSnapshotSchema.parse({ subscriptionId: id, instrumentId, interval: sub.interval, bars: page.bars, seq: seq0, status: page.status }));
      this.flush(sub, seq0);
      return success(id);
    } catch (error) {
      await this.remove(id);
      throw error;
    }
  }

  async unsubscribe(socketId: string, value: unknown): Promise<void> {
    const parsed = LiveUnsubscribeSchema.safeParse(value);
    if (!parsed.success) return;
    const client = this.clients.get(socketId);
    if (!client || !this.rateAllowed(client)) return;
    await this.remove(parsed.data.subscriptionId, socketId);
  }

  async disconnect(socketId: string): Promise<void> {
    const client = this.clients.get(socketId);
    if (!client) return;
    this.clients.delete(socketId);
    await Promise.all([...client.subscriptionIds].map(id => this.remove(id)));
  }

  upstreamReconnect(): void {
    for (const sub of this.subscriptions.values()) this.resync(sub, 'UPSTREAM_RECONNECT');
  }

  private changed(sub: Subscription, change: LiveChange): void {
    if (!this.subscriptions.has(sub.id) || sub.resyncSent) return;
    if (change.type === 'reconnect') { this.resync(sub, 'UPSTREAM_RECONNECT'); return; }
    if (change.type === 'status') { sub.emit('status', LiveStatusSchema.parse({ subscriptionId: sub.id, status: change.status })); return; }
    if (sub.buffering) {
      if (sub.pending.length >= MAX_PENDING) { this.resync(sub, 'SLOW_CONSUMER'); sub.pending.length = 0; return; }
      sub.pending.push(change.update); return;
    }
    this.acceptUpdate(sub.instrumentId, change.update);
  }

  private acceptUpdate(instrumentId: string, update: BarUpdate): void {
    const previous = this.lastSeq.get(instrumentId);
    if (previous !== undefined && update.seq <= previous) return;
    if (previous !== undefined && update.seq > previous + 1) {
      for (const id of this.byInstrument.get(instrumentId) ?? []) {
        const sub = this.subscriptions.get(id); if (sub) this.resync(sub, 'SEQ_GAP');
      }
      this.lastSeq.set(instrumentId, update.seq); return;
    }
    this.lastSeq.set(instrumentId, update.seq);
    for (const id of this.byInstrument.get(instrumentId) ?? []) {
      const sub = this.subscriptions.get(id);
      if (sub && !sub.buffering) { sub.lastSeq = update.seq; this.sendUpdate(sub, update, true); }
    }
  }

  private sendUpdate(sub: Subscription, update: BarUpdate, checkGap: boolean): void {
    if (checkGap && update.seq > sub.lastSeq + 1) { this.resync(sub, 'SEQ_GAP'); return; }
    sub.lastSeq = Math.max(sub.lastSeq, update.seq);
    if (sub.interval !== '1') {
      const bucket = this.data.aggregate([update.bar], sub.interval, sub.instrumentId)[0]?.time;
      if (bucket === undefined) return;
      if (sub.bucket !== bucket) { sub.bucket = bucket; sub.rawBucket.clear(); }
      sub.rawBucket.set(update.bar.time, update.bar);
      const bar = this.data.aggregate([...sub.rawBucket.values()].sort((a, b) => a.time - b.time), sub.interval, sub.instrumentId).at(-1);
      if (!bar) return;
      this.emitBar(sub, { ...update, bar });
      return;
    }
    this.emitBar(sub, update);
  }

  private emitBar(sub: Subscription, update: BarUpdate): void {
    if (sub.resyncSent) return;
    const sent = sub.emit('bar', LiveBarSchema.parse({ subscriptionId: sub.id, seq: update.seq, kind: update.kind, bar: update.bar }));
    if (!sent) { this.resync(sub, 'SLOW_CONSUMER'); return; }
    this.tap?.bar({ id: sub.id, socketId: sub.socketId, instrumentId: sub.instrumentId, interval: sub.interval }, update.bar, update.seq);
  }

  private flush(sub: Subscription, seq: number): void {
    const pending = sub.pending.splice(0).sort((a, b) => a.seq - b.seq);
    const seen = new Set<number>();
    for (const update of pending) {
      if (update.seq <= seq || seen.has(update.seq)) continue;
      seen.add(update.seq);
      if (update.seq > sub.lastSeq + 1 && sub.lastSeq >= seq) { this.resync(sub, 'SEQ_GAP'); continue; }
      this.sendUpdate(sub, update, false);
    }
    sub.buffering = false;
    this.lastSeq.set(sub.instrumentId, Math.max(this.lastSeq.get(sub.instrumentId) ?? 0, sub.lastSeq));
  }

  private resync(sub: Subscription, reason: 'SEQ_GAP' | 'UPSTREAM_RECONNECT' | 'SLOW_CONSUMER'): void {
    if (sub.resyncSent) return;
    sub.resyncSent = true;
    sub.pending.length = 0;
    sub.emit('resync', LiveResyncSchema.parse({ subscriptionId: sub.id, reason }));
    // The client resubscribes with afterSeq; a release failure leaves only a lease that expires on its own.
    void this.remove(sub.id).catch(() => undefined);
  }

  private async seedBucket(sub: Subscription): Promise<void> {
    const { bars } = await this.data.read(sub.instrumentId, '1', 5000);
    this.seedFromBars(sub, bars);
  }

  private seedFromBars(sub: Subscription, bars: readonly LiveBar[]): void {
    const last = bars.at(-1);
    const bucket = last ? this.data.aggregate([last], sub.interval, sub.instrumentId)[0]?.time : undefined;
    if (bucket === undefined) return;
    sub.bucket = bucket;
    for (const bar of bars) if (this.data.aggregate([bar], sub.interval, sub.instrumentId)[0]?.time === bucket) sub.rawBucket.set(bar.time, bar);
  }

  private async remove(id: string, ownerSocketId?: string): Promise<void> {
    const sub = this.subscriptions.get(id);
    if (!sub || (ownerSocketId !== undefined && sub.socketId !== ownerSocketId)) return;
    this.subscriptions.delete(id); sub.unwatch(); this.tap?.ended(id);
    const client = this.clients.get(sub.socketId); client?.subscriptionIds.delete(id);
    const ids = this.byInstrument.get(sub.instrumentId); ids?.delete(id);
    if (ids?.size === 0) { this.byInstrument.delete(sub.instrumentId); this.lastSeq.delete(sub.instrumentId); await this.data.release(sub.instrumentId); }
  }

  private rateAllowed(client: Client): boolean {
    const now = this.clock();
    client.calls = client.calls.filter(at => now - at < RATE_WINDOW_MS);
    if (client.calls.length >= RATE_MAX) return false;
    client.calls.push(now); return true;
  }
}

function success(subscriptionId: string): LiveAck { return LiveAckSchema.parse({ ok: true, subscriptionId }); }
function failure(code: 'LIMIT' | 'NOT_FOUND' | 'INVALID', message: string): LiveAck { return LiveAckSchema.parse({ ok: false, code, message }); }
