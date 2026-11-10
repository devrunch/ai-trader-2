import { Logger } from '@nestjs/common';
import { CircuitBreaker, CircuitOpenError, withTimeout } from '@aitrader/resilience';
import type { Tick } from '../../application/ports/live-feed';
import { UnavailableError } from '../../../../shared/errors';
import type { FeedTransport } from '../feed/resilient-feed';
import { KiteWsClient, type TickerMapping } from './kite-ws.client';
import type { SubscriptionManager } from './subscription-manager';

const reasonFor = (error: unknown) => error instanceof Error && error.message === 'AUTH_EXPIRED' ? 'AUTH_EXPIRED' : 'PROVIDER_DOWN';
/** The owner's session (not connected, CAPTCHA lock), not Kite's health: passed through for an honest AUTH_EXPIRED status. */
export const isSessionError = (error: unknown): error is UnavailableError =>
  error instanceof UnavailableError && ['NOT_CONNECTED', 'CAPTCHA_REQUIRED'].includes(String(error.details?.reason));
export class KiteTickerClient implements FeedTransport {
  private readonly connections = new Map<number, KiteWsClient>();
  private readonly opening = new Map<number, Promise<void>>();
  private readonly controller = new AbortController();
  private message: (ticks: Tick[]) => void = () => {};
  private closed: (reason: string) => void = () => {};
  private accessToken: string | undefined;
  private active = false;
  constructor(private readonly apiKey: string, private readonly token: (signal: AbortSignal) => Promise<string>,
    private readonly manager: SubscriptionManager, private readonly mappings: ReadonlyMap<string, TickerMapping>,
    private readonly breaker: CircuitBreaker, private readonly root?: string, private readonly clock = Date.now,
    private readonly warn: (reason: string) => void = reason => { new Logger('KiteWs').warn(reason); }) {}

  async connect(signal: AbortSignal): Promise<void> {
    this.active = true;
    try {
      await this.breaker.exec(async () => {
        const accessToken = await this.token(signal); signal.throwIfAborted(); this.accessToken = accessToken;
        const groups = this.manager.groups();
        await Promise.all((groups.length ? groups : [[]]).map((_, index) => this.open(index, accessToken, signal)));
      });
    } catch (error) {
      if (isSessionError(error)) throw error;
      throw new Error(error instanceof CircuitOpenError ? 'PROVIDER_DOWN' : reasonFor(error));
    }
  }
  close(): void {
    this.active = false; this.controller.abort();
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear(); this.opening.clear();
  }
  disconnectSocket(): void { this.closed('socket terminated'); this.close(); }
  onMessage(cb: (ticks: Tick[]) => void): void { this.message = cb; }
  onClose(cb: (reason: string) => void): void { this.closed = cb; }
  sendSubscribe(keys: readonly string[]): void {
    const groups = new Map<number, string[]>();
    for (const key of keys) { const index = this.manager.add(key); const values = groups.get(index) ?? []; values.push(key); groups.set(index, values); }
    for (const [index, values] of groups) {
      if (this.connections.has(index) && !this.opening.has(index)) this.connections.get(index)?.sendSubscribe(values);
      else this.subscribeOpening(index, values);
    }
  }
  sendUnsubscribe(keys: readonly string[]): void {
    const groups = this.manager.groups();
    for (let index = 0; index < groups.length; index++) {
      const values = keys.filter(key => groups[index]?.includes(key));
      if (values.length) this.connections.get(index)?.sendUnsubscribe(values);
    }
    for (const key of keys) this.manager.remove(key);
  }
  private async open(index: number, token: string, signal: AbortSignal): Promise<void> {
    const connection = new KiteWsClient({ apiKey: this.apiKey, accessToken: token, mappings: this.mappings,
      ...(this.root ? { root: this.root } : {}), clock: this.clock, warn: this.warn });
    this.connections.set(index, connection);
    connection.onMessage(ticks => { this.message(ticks); });
    connection.onClose(reason => { if (this.active) this.closed(reason); });
    await connection.connect(AbortSignal.any([signal, this.controller.signal]));
  }
  private subscribeOpening(index: number, values: readonly string[]): void {
    let pending = this.opening.get(index);
    if (!pending) {
      const token = this.accessToken;
      if (!token) throw new Error('AUTH_EXPIRED');
      pending = withTimeout(signal => this.open(index, token, signal), 15000, this.controller.signal);
      this.opening.set(index, pending);
    }
    void pending.then(() => {
      this.opening.delete(index);
      if (this.active) this.connections.get(index)?.sendSubscribe(values);
    }).catch((error: unknown) => { if (this.active) this.closed(reasonFor(error)); });
  }
}
