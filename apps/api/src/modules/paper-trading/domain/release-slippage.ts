const MINUTE = 60_000;

/** Spreads widen into a high-impact release and prices jump in the first minutes after it. */
export const RELEASE_WINDOW = { beforeMs: 2 * MINUTE, spikeMs: 5 * MINUTE, afterMs: 15 * MINUTE } as const;
const SPIKE_FACTOR = 6;
const WIDE_FACTOR = 3;

/**
 * The adverse slippage rate for a market-style fill at `at`: six times the normal rate in the first five minutes after a high-impact release,
 * three times from two minutes before it to fifteen minutes after. Otherwise paper results around releases would look better than real trading.
 */
export function releaseSlippage(base: number, at: number, releases: readonly number[]): number {
  let factor = 1;
  for (const release of releases) {
    if (at < release - RELEASE_WINDOW.beforeMs || at > release + RELEASE_WINDOW.afterMs) continue;
    factor = Math.max(factor, at >= release && at < release + RELEASE_WINDOW.spikeMs ? SPIKE_FACTOR : WIDE_FACTOR);
  }
  return base * factor;
}
