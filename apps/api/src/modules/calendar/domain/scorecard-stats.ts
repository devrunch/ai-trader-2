import type { EventReaction, ScorecardRelease } from '@aitrader/contracts';

export interface SymbolStat { symbol: string; n: number; avgAbsMove15Pct: number | null; avgMove15WhenBeatPct: number | null; avgMove15WhenMissPct: number | null; followedSurprisePct: number | null }

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const mean = (xs: number[]): number | null => xs.length ? round4(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

/**
 * Per-instrument stats over past releases, in terms of the sign of actual minus forecast (a beat is surprise > 0, a miss < 0; zero or unknown surprises
 * are left out of the beat/miss/followed figures). Whether higher is good for the currency is the event spec's `beat`, which readers apply.
 */
export function scorecardStats(releases: readonly Pick<ScorecardRelease, 'surprise' | 'reactions'>[]): SymbolStat[] {
  const bySymbol = new Map<string, Array<{ move: number; surprise: number | null }>>();
  for (const r of releases) {
    for (const x of r.reactions as readonly EventReaction[]) {
      if (x.move15Pct === null) continue;
      const list = bySymbol.get(x.symbol) ?? [];
      list.push({ move: x.move15Pct, surprise: r.surprise });
      bySymbol.set(x.symbol, list);
    }
  }
  return [...bySymbol].map(([symbol, rows]) => {
    const signed = rows.filter((x): x is { move: number; surprise: number } => x.surprise !== null && x.surprise !== 0);
    const followed = signed.filter(x => Math.sign(x.move) === Math.sign(x.surprise)).length;
    return { symbol, n: rows.length, avgAbsMove15Pct: mean(rows.map(x => Math.abs(x.move))),
      avgMove15WhenBeatPct: mean(signed.filter(x => x.surprise > 0).map(x => x.move)), avgMove15WhenMissPct: mean(signed.filter(x => x.surprise < 0).map(x => x.move)),
      followedSurprisePct: signed.length ? round4(followed / signed.length * 100) : null };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol));
}
