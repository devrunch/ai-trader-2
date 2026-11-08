import type { Bar } from './bar';

const values: readonly (keyof Pick<Bar, 'open' | 'high' | 'low' | 'close' | 'volume'>)[] = ['open', 'high', 'low', 'close', 'volume'];

export function mergeRepair(live: readonly Bar[], vendor: readonly Bar[]): { bars: Bar[]; repairedCount: number } {
  const byTime = new Map(live.map(bar => [bar.time, { ...bar }]));
  let repairedCount = 0;
  // A timestamp is the idempotency key; matching vendor data preserves a prior repair flag.
  for (const bar of vendor) {
    const existing = byTime.get(bar.time);
    if (!existing) byTime.set(bar.time, { ...bar });
    else if (values.some(key => existing[key] !== bar[key])) {
      byTime.set(bar.time, { ...bar, repaired: true });
      repairedCount++;
    }
  }
  return { bars: [...byTime.values()].sort((a, b) => a.time - b.time), repairedCount };
}
