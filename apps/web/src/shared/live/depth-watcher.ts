import { LiveDepthAckSchema, LiveDepthSchema, type DepthResponse } from '@aitrader/contracts';

interface Socket {
  readonly connected: boolean;
  on(event: string, fn: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
}
interface Entry { symbol: string; handlers: Set<(response: DepthResponse) => void>; id: string | undefined; seq: number }

/** Order-book pushes per symbol. A push with a `seq` not newer than the last applied is dropped; a reconnect resubscribes and restarts the count. */
export class DepthWatcher {
  private readonly entries = new Map<string, Entry>();
  private readonly byId = new Map<string, Entry>();
  private readonly early = new Map<string, unknown>(); // a push can beat its ack

  constructor(private readonly socket: Socket) { socket.on('depth', payload => { this.receive(payload); }); }

  watch(symbol: string, handler: (response: DepthResponse) => void): () => void {
    let entry = this.entries.get(symbol);
    if (!entry) {
      entry = { symbol, handlers: new Set(), id: undefined, seq: 0 };
      this.entries.set(symbol, entry);
      if (this.socket.connected) this.send(entry);
    }
    entry.handlers.add(handler);
    const target = entry;
    return () => {
      target.handlers.delete(handler);
      if (target.handlers.size > 0) return;
      this.entries.delete(symbol);
      if (target.id) { this.byId.delete(target.id); this.socket.emit('unsubscribeDepth', { subscriptionId: target.id }); }
    };
  }

  /** After a (re)connect the server has forgotten every subscription. */
  onConnect(): void { for (const entry of this.entries.values()) this.send(entry); }
  onDisconnect(): void { for (const entry of this.entries.values()) { if (entry.id) this.byId.delete(entry.id); entry.id = undefined; } }

  private send(entry: Entry): void {
    entry.id = undefined; entry.seq = 0;
    this.socket.emit('subscribeDepth', { symbol: entry.symbol }, (raw: unknown) => {
      const ack = LiveDepthAckSchema.safeParse(raw);
      if (!ack.success || !ack.data.ok) return;
      if (this.entries.get(entry.symbol) !== entry) { this.socket.emit('unsubscribeDepth', { subscriptionId: ack.data.subscriptionId }); return; }
      entry.id = ack.data.subscriptionId; this.byId.set(entry.id, entry);
      const early = this.early.get(entry.id); this.early.delete(entry.id);
      if (early !== undefined) this.receive(early);
    });
  }

  private receive(payload: unknown): void {
    const parsed = LiveDepthSchema.safeParse(payload);
    if (!parsed.success) return;
    const entry = this.byId.get(parsed.data.subscriptionId);
    if (!entry) { this.early.set(parsed.data.subscriptionId, payload); return; }
    if (parsed.data.seq <= entry.seq) return;
    entry.seq = parsed.data.seq;
    for (const handler of entry.handlers) handler(parsed.data.response);
  }
}
