import { KiteConnect } from 'kiteconnect';
import { CircuitBreaker, withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { KiteSessionService } from '../../../../shared/vendors/kite';
import type { RedisTokenBucket } from '../../../../shared/redis';
import type { Bar } from '../../domain/bar';
import type { MarketDataProvider, ProviderResult } from '../../application/ports/market-data-provider';
import { kiteBars, kiteFailure, kiteRequestTime } from './kite-history.mapping';

interface KiteHistoryClient {
  setAccessToken(token: string): void;
  getHistoricalData(token: number, interval: 'minute' | 'day', from: string, to: string): Promise<unknown>;
}
const tokenSchema = z.string().regex(/^\d+\/\d+$/).transform(value => Number(value.split('/')[1])).pipe(z.number().int().positive());

export class KiteHistoryProvider implements MarketDataProvider {
  readonly name = 'kite';
  private readonly breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 60000,
    isFailure: error => kiteFailure(error).reason === 'PROVIDER_DOWN' });
  private readonly createClient: () => KiteHistoryClient;
  constructor(private readonly session: Pick<KiteSessionService, 'getAccessToken'>,
    private readonly bucket: Pick<RedisTokenBucket, 'take'>, client: string | (() => KiteHistoryClient)) {
    this.createClient = typeof client === 'string'
      ? () => new KiteConnect({ api_key: client, timeout: 15000, debug: false }) : client;
  }

  async history(m: { providerSymbol: string; providerToken?: string; volumeType?: 'real' | 'tick' | 'none' },
    res: '1m' | '1d', from: number, to: number, signal: AbortSignal): Promise<ProviderResult<Bar[]>> {
    signal.throwIfAborted();
    const token = tokenSchema.safeParse(m.providerToken);
    if (!token.success) return { ok: false, reason: 'UNSUPPORTED' };
    const span = (res === '1m' ? 60 : 2000) * 86400000;
    const bars = new Map<number, Bar>();
    try {
      for (let start = from; start < to; start += span) {
        const end = Math.min(start + span, to);
        const chunk = await this.breaker.exec(async () => {
          await this.bucket.take(signal);
          return withTimeout(async abort => {
            const accessToken = await this.session.getAccessToken(abort);
            abort.throwIfAborted();
            const client = this.createClient();
            client.setAccessToken(accessToken);
            const payload = await client.getHistoricalData(token.data, res === '1m' ? 'minute' : 'day',
              kiteRequestTime(start), kiteRequestTime(end - 1));
            // Kite encodes its indices segment as 9 in the token's low byte.
            return kiteBars(payload, m.volumeType === 'none' || token.data % 256 === 9);
          }, 15000, signal);
        });
        for (const bar of chunk) if (bar.time >= from && bar.time < to) bars.set(bar.time, bar);
      }
      return bars.size ? { ok: true, data: [...bars.values()].sort((a, b) => a.time - b.time) } : { ok: false, reason: 'NO_DATA' };
    } catch (error) {
      signal.throwIfAborted();
      return kiteFailure(error);
    }
  }
}
