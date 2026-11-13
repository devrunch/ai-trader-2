const MINUTE = 60_000;
const HORIZONS = [5, 15, 60] as const;

export interface ReactionBar { time: number; open: number; close: number }
export interface ReactionMoves { refPrice: number | null; move5Pct: number | null; move15Pct: number | null; move60Pct: number | null }

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/**
 * Moves after a release, from 1-minute bars (open time in `time`). The reference is the open of the bar that starts at the release minute, the first
 * price traded in it; the move at +k is the close of the bar ending at release+k minutes over that reference, in percent. A missing bar gives null.
 */
export function reactionFromBars(bars: readonly ReactionBar[], releaseAt: number): ReactionMoves {
  const byTime = new Map(bars.map(b => [b.time, b]));
  const start = Math.floor(releaseAt / MINUTE) * MINUTE;
  const ref = byTime.get(start)?.open;
  if (ref === undefined || !(ref > 0)) return { refPrice: null, move5Pct: null, move15Pct: null, move60Pct: null };
  const [m5, m15, m60] = HORIZONS.map(k => { const end = byTime.get(start + k * MINUTE - MINUTE); return end ? round4((end.close / ref - 1) * 100) : null; });
  return { refPrice: ref, move5Pct: m5 ?? null, move15Pct: m15 ?? null, move60Pct: m60 ?? null };
}

/** Hides moves whose horizon had not passed at `asOf` (the bar ending at release+k needs asOf >= release+k). */
export function reactionAsOf<T extends Omit<ReactionMoves, 'refPrice'>>(moves: T, releaseAt: number, asOf: number): T {
  const start = Math.floor(releaseAt / MINUTE) * MINUTE;
  const seen = (k: number): boolean => asOf >= start + k * MINUTE;
  return { ...moves, move5Pct: seen(5) ? moves.move5Pct : null, move15Pct: seen(15) ? moves.move15Pct : null, move60Pct: seen(60) ? moves.move60Pct : null };
}
