import type { FillHistory } from '../../application/fill-history';
import type { CandleStore } from '../../application/ports/candle-store';

export function gapBackfill(fill: Pick<FillHistory, 'execute'>, store: CandleStore, source: 'kite' | 'deriv') {
  return async (id: string, from: number, to: number, signal: AbortSignal): Promise<void> => {
    const start = Math.floor(from / 60000) * 60000; const end = Math.floor(to / 60000) * 60000;
    if (start >= end) return;
    const result = await fill.execute(id, '1m', start, end, signal);
    if (!result.ok) throw new Error(result.reason);
    const bars = await store.range1m(id, start, end, signal);
    await store.upsert1m(id, bars.map(bar => ({ ...bar, repaired: true })), source, signal);
  };
}
