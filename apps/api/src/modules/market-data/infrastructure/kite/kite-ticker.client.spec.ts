import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '@aitrader/resilience';
import { UnavailableError } from '../../../../shared/errors';
import { KiteTickerClient } from './kite-ticker.client';
import { SubscriptionManager } from './subscription-manager';

const notConnected = () => new UnavailableError('Kite not connected', { reason: 'NOT_CONNECTED' });

describe('KiteTickerClient session errors (live finding 2026-11-10)', () => {
  it('passes a not-connected session through unchanged so the feed reports AUTH_EXPIRED, not PROVIDER_DOWN', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 30_000 });
    const client = new KiteTickerClient('key', () => Promise.reject(notConnected()), new SubscriptionManager(), new Map(), breaker, undefined, Date.now, () => undefined);
    const error = await client.connect(new AbortController().signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnavailableError);
    expect((error as UnavailableError).details).toMatchObject({ reason: 'NOT_CONNECTED' });
  });

  it('a session the owner has not connected never opens the provider circuit breaker', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 30_000, isFailure: error => !(error instanceof UnavailableError) });
    const client = new KiteTickerClient('key', () => Promise.reject(notConnected()), new SubscriptionManager(), new Map(), breaker, undefined, Date.now, () => undefined);
    for (let i = 0; i < 5; i++) await client.connect(new AbortController().signal).catch(() => undefined);
    const error = await client.connect(new AbortController().signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnavailableError);
  });
});
