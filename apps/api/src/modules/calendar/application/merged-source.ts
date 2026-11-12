import type { EventSource, RawEvent } from './calendar';

/** Several feeds as one: a failing feed is skipped so the others still land; it only throws when every feed fails. */
export class MergedSource implements EventSource {
  constructor(private readonly sources: readonly EventSource[]) {}

  async fetch(signal: AbortSignal): Promise<RawEvent[]> {
    const results = await Promise.allSettled(this.sources.map(s => s.fetch(signal)));
    const ok = results.filter((r): r is PromiseFulfilledResult<RawEvent[]> => r.status === 'fulfilled');
    if (ok.length === 0) throw results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason as Error;
    return ok.flatMap(r => r.value);
  }
}
