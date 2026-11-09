import WebSocket, { type RawData } from 'ws';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Tick } from '../../application/ports/live-feed';
import type { FeedTransport } from '../feed/resilient-feed';
import { decodeKitePackets, type KiteRawTick } from './kite-ticks.decoder';

export interface TickerMapping { id: string; token: number; volume: boolean }
interface Options {
  apiKey: string;
  accessToken: string;
  mappings: ReadonlyMap<string, TickerMapping>;
  root?: string;
  clock?: () => number;
  warn: (reason: string) => void;
}
// Kite sends other text types too (e.g. instruments_meta on connect); only 'error' needs handling.
const envelope = z.object({ type: z.string(), data: z.unknown().optional() });
const errorShape = z.object({ error_type: z.string().optional(), message: z.string().optional(), code: z.union([z.string(), z.number()]).optional(), data: z.unknown().optional() });
function authError(value: unknown): boolean {
  if (typeof value === 'string') return /auth|token|session|401|403/i.test(value);
  const parsed = errorShape.safeParse(value);
  return parsed.success && (authError(`${parsed.data.error_type ?? ''} ${parsed.data.message ?? ''} ${String(parsed.data.code ?? '')}`)
    || (parsed.data.data !== undefined && authError(parsed.data.data)));
}
function bytes(data: RawData): Uint8Array {
  return data instanceof ArrayBuffer ? new Uint8Array(data) : Array.isArray(data) ? Buffer.concat(data) : data;
}

export class KiteWsClient implements FeedTransport {
  private socket: WebSocket | undefined;
  private readonly controller = new AbortController();
  private readonly reverse = new Map<number, TickerMapping>();
  private message: (ticks: Tick[]) => void = () => {};
  private closed: (reason: string) => void = () => {};
  private active = false;
  private notified = false;
  private activityAt = 0;
  constructor(private readonly opts: Options) {}
  get lastActivityAt(): number { return this.activityAt; }
  onMessage(cb: (ticks: Tick[]) => void): void { this.message = cb; }
  onClose(cb: (reason: string) => void): void { this.closed = cb; }
  async connect(signal: AbortSignal): Promise<void> {
    this.active = true;
    const parent = AbortSignal.any([signal, this.controller.signal]);
    const url = new URL(this.opts.root ?? 'wss://ws.kite.trade');
    url.searchParams.set('api_key', this.opts.apiKey); url.searchParams.set('access_token', this.opts.accessToken);
    try { await withTimeout(abort => this.open(url, abort), 15000, parent); }
    catch (error) { this.close(); throw error; }
  }
  close(): void { this.active = false; this.controller.abort(); this.socket?.terminate(); this.reverse.clear(); }
  sendSubscribe(keys: readonly string[]): void {
    const mappings = keys.map(key => this.opts.mappings.get(key)).filter(mapping => mapping !== undefined);
    for (const mapping of mappings) this.reverse.set(mapping.token, mapping);
    this.send({ a: 'subscribe', v: mappings.map(mapping => mapping.token) });
    for (const volume of [true, false]) {
      const tokens = mappings.filter(mapping => mapping.volume === volume).map(mapping => mapping.token);
      if (tokens.length) this.send({ a: 'mode', v: ['full', tokens] }); // full mode carries exchange timestamps, indices included
    }
  }
  sendUnsubscribe(keys: readonly string[]): void {
    const tokens = keys.map(key => this.opts.mappings.get(key)?.token).filter(token => token !== undefined);
    this.send({ a: 'unsubscribe', v: tokens }); for (const token of tokens) this.reverse.delete(token);
  }
  private open(url: URL, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const socket = new WebSocket(url, { handshakeTimeout: 15000, maxPayload: 2 * 1024 * 1024 });
      this.socket = socket; socket.binaryType = 'arraybuffer';
      const cancel = () => { socket.terminate(); reject(new Error('ABORTED')); };
      const fail = (reason: string) => { signal.removeEventListener('abort', cancel); reject(new Error(reason)); this.finish(reason); };
      signal.addEventListener('abort', cancel, { once: true });
      socket.once('open', () => { signal.removeEventListener('abort', cancel); this.activityAt = this.now(); resolve(); });
      socket.on('error', error => { fail(authError(error.message) ? 'AUTH_EXPIRED' : 'PROVIDER_DOWN'); });
      socket.once('unexpected-response', (request, response) => {
        fail(response.statusCode === 401 || response.statusCode === 403 ? 'AUTH_EXPIRED' : 'PROVIDER_DOWN');
        response.destroy(); request.destroy();
      });
      socket.once('close', (_code, reason) => { fail(authError(reason.toString('utf8')) ? 'AUTH_EXPIRED' : 'PROVIDER_DOWN'); });
      socket.on('message', (data, binary) => { if (this.active) this.receive(data, binary); });
    });
  }
  private now(): number { return (this.opts.clock ?? Date.now)(); }
  private finish(reason: string): void {
    if (!this.active || this.notified) return;
    this.notified = true; this.closed(reason); this.close();
  }
  private send(command: { a: string; v: unknown[] }): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('PROVIDER_DOWN');
    void withTimeout(() => new Promise<void>((resolve, reject) => {
      socket.send(JSON.stringify(command), { binary: false }, error => { if (error) reject(error); else resolve(); });
    }), 5000, this.controller.signal).catch(() => { this.finish('PROVIDER_DOWN'); });
  }
  private receive(data: RawData, binary: boolean): void {
    this.activityAt = this.now();
    try {
      const payload = bytes(data);
      if (!binary) { this.text(new TextDecoder().decode(payload)); return; }
      const ticks = decodeKitePackets(Uint8Array.from(payload).buffer).flatMap(raw => this.canonical(raw));
      if (ticks.length) this.message(ticks);
    } catch {
      this.opts.warn('Kite WebSocket invalid frame'); this.finish(binary ? 'INVALID_TICKS' : 'INVALID_MESSAGE');
    }
  }
  private canonical(raw: KiteRawTick): Tick[] {
    const mapping = this.reverse.get(raw.instrument_token);
    return mapping ? [{ instrumentId: mapping.id, at: raw.exchange_timestamp ?? raw.last_trade_time ?? this.now(),
      price: raw.last_price, cumVolume: mapping.volume ? raw.volume_traded ?? null : null }] : [];
  }
  private text(payload: string): void {
    const value: unknown = JSON.parse(payload); const parsed = envelope.parse(value);
    if (parsed.type !== 'error') return;
    const reason = authError(value) ? 'AUTH_EXPIRED' : 'PROVIDER_DOWN';
    this.opts.warn(`Kite WebSocket error frame: ${reason}`);
    if (reason === 'AUTH_EXPIRED') this.finish(reason);
  }
}
