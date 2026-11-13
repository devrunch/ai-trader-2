import { randomUUID } from 'node:crypto';
import { LiveDepthAckSchema, LiveDepthSchema, LiveDepthSubscribeSchema, LiveDepthUnsubscribeSchema, type DepthResponse } from '@aitrader/contracts';

type Ack = ReturnType<typeof LiveDepthAckSchema.parse>;
export interface DepthData { resolve(symbol: string): Promise<string | null>; read(instrumentId: string): Promise<DepthResponse> }
interface Sub { id: string; socketId: string; instrumentId: string; seq: number; last: string | undefined }
interface Watch { subs: Map<string, Sub>; timer: ReturnType<typeof setInterval>; reading: boolean }
type Emit = (socketId: string, event: string, payload: unknown) => void;

const MAX_PER_SOCKET = 10;
/** A push is worth sending when the book's time or the reason it is missing changed. */
const fingerprint = (r: DepthResponse): string => `${String(r.depth?.at ?? '')}|${r.unavailable ?? ''}`;

/**
 * Order-book pushes: one read per instrument per second however many sockets watch it, and a snapshot goes to a
 * subscriber only when it changed. `seq` rises by one per push so a client can drop anything out of order.
 */
export class LiveDepth {
  private readonly watches = new Map<string, Watch>();
  private readonly bySocket = new Map<string, Set<Sub>>();
  constructor(private readonly data: DepthData, private readonly emit: Emit, private readonly intervalMs = 1000) {}

  async subscribe(socketId: string, value: unknown): Promise<Ack> {
    const parsed = LiveDepthSubscribeSchema.safeParse(value);
    if (!parsed.success) return { ok: false, code: 'INVALID', message: 'Invalid depth subscription' };
    if ((this.bySocket.get(socketId)?.size ?? 0) >= MAX_PER_SOCKET) return { ok: false, code: 'LIMIT', message: 'Depth subscription limit exceeded' };
    const instrumentId = await this.data.resolve(parsed.data.symbol);
    if (!instrumentId) return { ok: false, code: 'NOT_FOUND', message: 'Unknown symbol' };
    const sub: Sub = { id: randomUUID(), socketId, instrumentId, seq: 0, last: undefined };
    const subs = this.bySocket.get(socketId) ?? new Set<Sub>(); subs.add(sub); this.bySocket.set(socketId, subs);
    let watch = this.watches.get(instrumentId);
    if (!watch) {
      const created: Watch = { subs: new Map(), reading: false, timer: setInterval(() => { void this.poll(instrumentId); }, this.intervalMs) };
      watch = created; this.watches.set(instrumentId, created);
    }
    watch.subs.set(sub.id, sub);
    void this.poll(instrumentId); // the first snapshot should not wait a second
    return { ok: true, subscriptionId: sub.id };
  }

  unsubscribe(socketId: string, value: unknown): void {
    const parsed = LiveDepthUnsubscribeSchema.safeParse(value);
    if (!parsed.success) return;
    const sub = [...this.bySocket.get(socketId) ?? []].find(s => s.id === parsed.data.subscriptionId);
    if (sub) this.remove(sub);
  }

  disconnect(socketId: string): void { for (const sub of [...this.bySocket.get(socketId) ?? []]) this.remove(sub); }

  private remove(sub: Sub): void {
    const set = this.bySocket.get(sub.socketId); set?.delete(sub); if (set?.size === 0) this.bySocket.delete(sub.socketId);
    const watch = this.watches.get(sub.instrumentId);
    watch?.subs.delete(sub.id);
    if (watch?.subs.size === 0) { clearInterval(watch.timer); this.watches.delete(sub.instrumentId); }
  }

  private async poll(instrumentId: string): Promise<void> {
    const watch = this.watches.get(instrumentId);
    if (!watch || watch.reading) return;
    watch.reading = true;
    try {
      const response = await this.data.read(instrumentId); const print = fingerprint(response);
      for (const sub of watch.subs.values()) {
        if (sub.last === print) continue;
        sub.last = print; sub.seq += 1;
        this.emit(sub.socketId, 'depth', LiveDepthSchema.parse({ subscriptionId: sub.id, seq: sub.seq, instrumentId, response }));
      }
    } catch { /* the next tick reads again; the book is a snapshot, nothing is lost */ } finally { watch.reading = false; }
  }
}
