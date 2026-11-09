import type { Redis } from 'ioredis';
import { Logger } from '@nestjs/common';
import { BarUpdateSchema, DataStatusSchema, PROVIDER_REASONS } from '@aitrader/contracts';
import { z } from 'zod';
import type { LiveChange } from '../application/ports/live-data';

const feedChange = z.object({ vendor: z.enum(['kite', 'deriv', 'us-delayed']), state: z.enum(['connecting', 'live', 'reconnecting', 'stale', 'stopped']), reason: z.enum(PROVIDER_REASONS).optional(), at: z.number().int() });
type Listener = (change: LiveChange) => void;
const reasonDefaults = 'PROVIDER_DOWN' as const;

export class RedisLiveUpdateBus {
  private readonly redis: Redis;
  private readonly listeners = new Map<string, Set<Listener>>();
  private ready: Promise<void>;
  private reconnecting = false;
  private readonly warn: (message: string) => void;
  constructor(redis: Redis, warn?: (message: string) => void) {
    const logger = new Logger(RedisLiveUpdateBus.name);
    this.warn = warn ?? (message => { logger.warn(message); });
    this.redis = redis.duplicate();
    this.ready = new Promise<void>((resolve, reject) => {
      const subscribe = () => { void this.redis.psubscribe('md:bars:*').then(() => this.redis.subscribe('md:feed-state:changed')).then(() => { resolve(); }, reject); };
      if (this.redis.status === 'ready') subscribe();
      else if (this.redis.status === 'wait') void this.redis.connect().then(subscribe, reject);
      else this.redis.once('ready', subscribe);
    });
    void this.ready.catch((error: unknown) => { this.warn(`Live Redis subscriber unavailable: ${errorName(error)}`); });
    this.redis.on('pmessage', (_pattern, channel, message) => { this.onBar(channel, message); });
    this.redis.on('message', (channel, message) => { if (channel === 'md:feed-state:changed') this.onFeedState(message); });
    this.redis.on('reconnecting', () => { this.reconnecting = true; });
    this.redis.on('ready', () => {
      if (!this.reconnecting) return;
      this.reconnecting = false;
      for (const listeners of this.listeners.values()) for (const listener of listeners) listener({ type: 'reconnect' });
    });
    this.redis.on('error', error => { this.warn(`Live Redis subscriber error: ${error.name}`); });
  }
  async start(): Promise<void> { await this.ready; }
  watch(instrumentId: string, listener: Listener): () => void {
    const listeners = this.listeners.get(instrumentId) ?? new Set<Listener>();
    listeners.add(listener); this.listeners.set(instrumentId, listeners); void this.ready.catch((error: unknown) => { this.warn(`Live Redis subscription failed: ${errorName(error)}`); });
    return () => { listeners.delete(listener); if (listeners.size === 0) this.listeners.delete(instrumentId); };
  }
  close(): void { this.listeners.clear(); this.redis.disconnect(); }
  onModuleDestroy(): void { this.close(); }
  private onBar(channel: string, raw: string): void {
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { this.warn('Malformed live bar message: SyntaxError'); return; }
    const parsed = BarUpdateSchema.safeParse(decoded);
    if (!parsed.success) { this.warn('Malformed live bar message: ZodError'); return; }
    const instrumentId = channel.slice('md:bars:'.length);
    for (const listener of this.listeners.get(instrumentId) ?? []) listener({ type: 'bar', update: parsed.data });
  }
  private onFeedState(raw: string): void {
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { this.warn('Malformed live feed state: SyntaxError'); return; }
    const parsed = feedChange.safeParse(decoded);
    if (!parsed.success) { this.warn('Malformed live feed state: ZodError'); return; }
    const { vendor, state, reason } = parsed.data;
    const status = state === 'live' ? (vendor === 'us-delayed' ? { state: 'delayed' as const, delayMs: 900_000 } : { state: 'ok' as const })
      : { state: 'stale' as const, reason: reason ?? reasonDefaults };
    const valid = DataStatusSchema.parse(status);
    for (const [id, listeners] of this.listeners) {
      const exchange = id.split(':')[0];
      const isVendor = vendor === 'kite' ? ['NSE', 'NFO', 'BSE', 'MCX'].includes(exchange ?? '')
        : vendor === 'deriv' ? ['FX', 'OANDA'].includes(exchange ?? '')
          : ['NASDAQ', 'NYSE', 'NYSEARCA', 'AMEX', 'CBOE', 'IEX'].includes(exchange ?? '');
      if (isVendor) for (const listener of listeners) listener({ type: 'status', status: valid });
    }
  }
}

function errorName(error: unknown): string { return error instanceof Error ? error.name : 'UnknownError'; }
