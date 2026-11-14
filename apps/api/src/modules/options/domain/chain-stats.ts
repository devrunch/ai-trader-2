export interface SnapshotLeg { symbol: string; strike: number; type: 'CE' | 'PE'; ltp: number | null; oi: number | null; volume: number | null }

/** Put open interest over call open interest; null when there are no calls with open interest. */
export function pcr(legs: readonly SnapshotLeg[]): number | null {
  const sum = (type: 'CE' | 'PE'): number => legs.filter(l => l.type === type).reduce((total, l) => total + (l.oi ?? 0), 0);
  const calls = sum('CE');
  return calls > 0 ? Math.round(sum('PE') / calls * 1000) / 1000 : null;
}

/** The strike where option writers pay the least at expiry: the minimum of total intrinsic value over all open interest. Ties take the lower strike. */
export function maxPain(legs: readonly SnapshotLeg[]): number | null {
  const strikes = [...new Set(legs.filter(l => (l.oi ?? 0) > 0).map(l => l.strike))].sort((a, b) => a - b);
  let best: { strike: number; pain: number } | null = null;
  for (const settle of strikes) {
    const pain = legs.reduce((total, l) => total + (l.oi ?? 0) * (l.type === 'CE' ? Math.max(settle - l.strike, 0) : Math.max(l.strike - settle, 0)), 0);
    if (!best || pain < best.pain) best = { strike: settle, pain };
  }
  return best?.strike ?? null;
}

/** The largest open-interest increases against the baseline, biggest first; legs without a baseline or with no increase are left out. */
export function buildups(legs: readonly SnapshotLeg[], baseline: ReadonlyMap<string, number>, limit: number): Array<{ strike: number; type: 'CE' | 'PE'; oi: number; oiChange: number }> {
  return legs.flatMap(l => {
    const before = baseline.get(l.symbol);
    return l.oi === null || before === undefined || l.oi <= before ? [] : [{ strike: l.strike, type: l.type, oi: l.oi, oiChange: l.oi - before }];
  }).sort((a, b) => b.oiChange - a.oiChange).slice(0, limit);
}

/** The strike nearest to `spot`; the lower one on a tie. */
export function nearestStrike(strikes: readonly number[], spot: number): number | null {
  return [...strikes].sort((a, b) => a - b).reduce<number | null>((best, s) => best === null || Math.abs(s - spot) < Math.abs(best - spot) ? s : best, null);
}
