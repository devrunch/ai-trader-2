import YahooFinance from 'yahoo-finance2';
import { CircuitBreaker, withTimeout } from '@aitrader/resilience';
import type { MarketDataProvider, ProviderResult } from '../../application/ports/market-data-provider';
import type { Bar } from '../../domain/bar';
import { yahooBars, yahooFailure, yahooSymbol } from './yahoo.mapping';

interface ChartClient {
  chart(symbol: string, options: { interval: '1m' | '1d'; period1: Date; period2: Date }, moduleOptions: { fetchOptions: { signal: AbortSignal } }): Promise<unknown>;
}
export class UsDelayedProvider implements MarketDataProvider {
  readonly name = 'us-delayed';
  private readonly breaker: CircuitBreaker;
  constructor(private readonly client: ChartClient = new YahooFinance({ suppressNotices: ['yahooSurvey'] }), private readonly clock: () => number = Date.now) {
    this.breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 300000, now: clock,
      isFailure: error => yahooFailure(error).reason !== 'UNSUPPORTED' });
  }
  async history(mapping: { providerSymbol: string }, res: '1m' | '1d', from: number, to: number, signal: AbortSignal): Promise<ProviderResult<Bar[]>> {
    signal.throwIfAborted();
    if (res === '1m' && from < this.clock() - 30 * 86400000) return { ok: false, reason: 'NO_DATA', detail: 'yahoo keeps 30 days of 1m' };
    const span = res === '1m' ? 7 * 86400000 : Math.max(1, to - from); const rows: Bar[] = [];
    try {
      for (let start = from; start < to; start += span) {
        const chunk = await this.breaker.exec(() => withTimeout(async abort => yahooBars(await this.client.chart(yahooSymbol(mapping.providerSymbol),
          { interval: res, period1: new Date(start), period2: new Date(Math.min(start + span, to)) }, { fetchOptions: { signal: abort } })), 15000, signal));
        rows.push(...chunk);
      }
      const data = [...new Map(rows.map(bar => [bar.time, bar])).values()]
        .filter(bar => bar.time >= from && bar.time < to).sort((a, b) => a.time - b.time);
      return data.length === 0 ? { ok: false, reason: 'NO_DATA' } : { ok: true, data };
    } catch (error) { signal.throwIfAborted(); return yahooFailure(error); }
  }
}
