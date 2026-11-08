import { CircuitBreaker, CircuitOpenError, withTimeout } from '@aitrader/resilience';
import { UnavailableError } from '../../../../shared/errors/index.js';

export type FetchText = (url: string, signal: AbortSignal) => Promise<string>;
export type Clock = () => Date;

export function textFetcher(headers?: Record<string, string>): FetchText {
  return (url, parent) => withTimeout(async (signal) => {
    const response = await fetch(url, { signal, ...(headers ? { headers } : {}) });
    if (!response.ok) throw new UnavailableError('Instrument listing request failed', { status: response.status });
    return response.text();
  }, 30000, parent);
}

export function kolkataDate(clock: Clock): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(clock());
}

export class SourceRuntime {
  private readonly breaker: CircuitBreaker;
  constructor(private readonly vendor: string, clock: Clock) {
    this.breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 15 * 60000, now: () => clock().getTime() });
  }
  async run<T>(operation: () => Promise<T>): Promise<T> {
    try { return await this.breaker.exec(operation); }
    catch (error: unknown) {
      if (error instanceof CircuitOpenError) throw new UnavailableError('Instrument source unavailable', { vendor: this.vendor, reason: 'PROVIDER_DOWN' });
      throw error;
    }
  }
}
