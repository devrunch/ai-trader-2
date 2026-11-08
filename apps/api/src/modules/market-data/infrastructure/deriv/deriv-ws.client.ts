import WebSocket, { type RawData } from 'ws';
import { withTimeout } from '@aitrader/resilience';
import type { Tick } from '../../application/ports/live-feed';
import type { FeedTransport } from '../feed/resilient-feed';
import { derivRequest, parseDerivMessage } from './deriv.messages';

interface Options { root?: string }
function text(raw: RawData): string {
  return Buffer.isBuffer(raw) ? raw.toString('utf8') : new TextDecoder().decode(raw instanceof ArrayBuffer ? new Uint8Array(raw) : Buffer.concat(raw));
}
function endpoint(opts: Options): URL {
  return new URL(opts.root ?? 'wss://api.derivws.com/trading/v1/options/ws/public');
}
// History sockets have their own lifecycle and cannot queue behind live subscriptions.
export async function requestDeriv(opts: Options, command: ReturnType<typeof derivRequest.history>, signal: AbortSignal): Promise<unknown> {
  return withTimeout(abort => new Promise((resolve, reject) => {
    abort.throwIfAborted();
    const socket = new WebSocket(endpoint(opts), { handshakeTimeout: 15000, maxPayload: 4 * 1024 * 1024 });
    const finish = (error?: Error, value?: unknown) => {
      abort.removeEventListener('abort', cancel); socket.terminate();
      if (error) reject(error); else resolve(value);
    };
    const cancel = () => { finish(new Error('ABORTED')); };
    abort.addEventListener('abort', cancel, { once: true });
    socket.once('open', () => { socket.send(JSON.stringify(command), error => { if (error) finish(new Error('PROVIDER_DOWN')); }); });
    socket.on('message', raw => {
      try { const value = parseDerivMessage(text(raw)); if (value.req_id === command.req_id) finish(undefined, value); }
      catch { finish(new Error('PROVIDER_DOWN')); }
    });
    socket.once('error', () => { finish(new Error('PROVIDER_DOWN')); });
    socket.once('close', () => { finish(new Error('PROVIDER_DOWN')); });
  }), 15000, signal);
}

export class DerivWsClient implements FeedTransport {
  private socket: WebSocket | undefined;
  private readonly controller = new AbortController();
  private readonly subscriptions = new Map<string, string>();
  private readonly desired = new Set<string>();
  private ping: ReturnType<typeof setInterval> | undefined;
  private sequence = 0;
  private active = false;
  private message: (ticks: Tick[]) => void = () => {};
  private closed: (reason: string) => void = () => {};
  constructor(private readonly opts: Options, private readonly mappings: ReadonlyMap<string, string>) {}
  onMessage(cb: (ticks: Tick[]) => void): void { this.message = cb; }
  onClose(cb: (reason: string) => void): void { this.closed = cb; }
  disconnectSocket(): void { this.finish('PROVIDER_DOWN'); }
  async connect(signal: AbortSignal): Promise<void> {
    this.active = true;
    try {
      await withTimeout(abort => new Promise<void>((resolve, reject) => {
        abort.throwIfAborted();
        const socket = new WebSocket(endpoint(this.opts), { handshakeTimeout: 15000, maxPayload: 4 * 1024 * 1024 }); this.socket = socket;
        const cancel = () => { socket.terminate(); reject(new Error('ABORTED')); };
        abort.addEventListener('abort', cancel, { once: true });
        const fail = () => { abort.removeEventListener('abort', cancel); reject(new Error('PROVIDER_DOWN')); this.finish('PROVIDER_DOWN'); };
        socket.once('open', () => {
          abort.removeEventListener('abort', cancel);
          this.ping = setInterval(() => { this.send(derivRequest.ping()); }, 30000); resolve();
        });
        socket.on('message', raw => { if (this.active) this.receive(text(raw)); });
        socket.on('error', fail); socket.once('close', fail);
      }), 15000, AbortSignal.any([signal, this.controller.signal]));
    } catch (error) { this.close(); throw error; }
  }
  close(): void {
    this.active = false; clearInterval(this.ping); this.controller.abort(); this.socket?.terminate(); this.subscriptions.clear(); this.desired.clear();
  }
  sendSubscribe(keys: readonly string[]): void {
    for (const key of keys) { this.desired.add(key); this.send(derivRequest.subscribe(key, ++this.sequence)); }
  }
  sendUnsubscribe(keys: readonly string[]): void {
    for (const key of keys) {
      this.desired.delete(key); const id = this.subscriptions.get(key);
      if (id) this.send(derivRequest.forget(id)); this.subscriptions.delete(key);
    }
  }
  private finish(reason: string): void { if (this.active) { this.closed(reason); this.close(); } }
  private send(command: object): void {
    const socket = this.socket;
    if (socket?.readyState !== WebSocket.OPEN) { this.finish('PROVIDER_DOWN'); return; }
    void withTimeout(() => new Promise<void>((resolve, reject) => {
      socket.send(JSON.stringify(command), error => { if (error) reject(error); else resolve(); });
    }), 5000, this.controller.signal).catch(() => { this.finish('PROVIDER_DOWN'); });
  }
  private receive(text: string): void {
    try {
      const value = parseDerivMessage(text);
      if (value.error) { if (value.error.code !== 'MarketIsClosed') this.finish('PROVIDER_DOWN'); return; }
      const tick = value.tick; if (!tick) return;
      if (!this.desired.has(tick.symbol)) { if (value.subscription) this.send(derivRequest.forget(value.subscription.id)); return; }
      if (value.subscription) this.subscriptions.set(tick.symbol, value.subscription.id);
      const id = this.mappings.get(tick.symbol);
      if (id) this.message([{ instrumentId: id, at: tick.epoch * 1000, price: tick.quote, cumVolume: null }]);
    } catch { this.finish('PROVIDER_DOWN'); }
  }
}
