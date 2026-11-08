import { CircuitBreaker, withTimeout } from '@aitrader/resilience';
import type { MarketDataProvider, ProviderResult } from '../../application/ports/market-data-provider';
import type { Bar } from '../../domain/bar';
import { derivRequest, parseDerivMessage } from './deriv.messages';
import { requestDeriv } from './deriv-ws.client';

interface Options { root?: string; request?: (command: ReturnType<typeof derivRequest.history>, signal: AbortSignal) => Promise<unknown> }
export class DerivHistoryProvider implements MarketDataProvider {
  readonly name = 'deriv';
  private sequence = 0;
  private readonly breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 60000,
    isFailure: error => !(error instanceof Error && error.message === 'MARKET_CLOSED') });
  constructor(private readonly opts: Options = {}) {}
  async history(mapping: { providerSymbol: string }, res: '1m' | '1d', from: number, to: number, signal: AbortSignal): Promise<ProviderResult<Bar[]>> {
    signal.throwIfAborted();
    if (!/^frx[A-Z]{6}$/.test(mapping.providerSymbol)) return { ok: false, reason: 'UNSUPPORTED' };
    const seconds = res === '1m' ? 60 : 86400; const bars = new Map<number, Bar>();
    let end = Math.ceil(to / 1000) - 1;
    try {
      for (let page = 0; page < 20 && end * 1000 >= from; page++) {
        const command = derivRequest.history(mapping.providerSymbol, seconds, end, ++this.sequence);
        const chunk = await this.breaker.exec(() => withTimeout(async abort => {
          const payload = this.opts.request ? await this.opts.request(command, abort)
            : await requestDeriv(this.opts, command, abort);
          const value = parseDerivMessage(JSON.stringify(payload));
          if (value.error) throw new Error(value.error.code === 'MarketIsClosed' ? 'MARKET_CLOSED' : 'PROVIDER_DOWN');
          return value.candles ?? [];
        }, 15000, signal));
        for (const candle of chunk) {
          const time = candle.epoch * 1000;
          if (time >= from && time < to) bars.set(time, { time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: null });
        }
        // Empty pages advance through closed-market spans without repeating an end.
        const oldest = chunk.length ? Math.min(...chunk.map(candle => candle.epoch)) : end - 999 * seconds;
        end = Math.min(end - seconds, oldest - seconds);
      }
      return bars.size ? { ok: true, data: [...bars.values()].sort((a, b) => a.time - b.time) } : { ok: false, reason: 'NO_DATA' };
    } catch (error) {
      signal.throwIfAborted(); return { ok: false, reason: error instanceof Error && error.message === 'MARKET_CLOSED' ? 'MARKET_CLOSED' : 'PROVIDER_DOWN' };
    }
  }
}
