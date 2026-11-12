import type { DeskScoreSummary } from '@aitrader/contracts';

export interface ScoredDecision { action: 'BUY' | 'SELL' | 'HOLD'; entry: number | null; stopLoss: number | null; target: number | null }
export interface FutureBar { time: number; open: number; high: number; low: number; close: number }
export type DeskOutcome = 'target' | 'stop' | 'timeout' | 'no-trade' | 'no-data';
export interface BarScore { outcome: DeskOutcome; r: number | null; exitPrice: number | null }

const round2 = (v: number) => Math.round(v * 100) / 100;
const NO_TRADE: BarScore = { outcome: 'no-trade', r: null, exitPrice: null };

/** Walks the bars after the decision; a bar touching both stop and target counts as the stop (FR-BT-2). */
export function scoreDecision(decision: ScoredDecision, future: FutureBar[], horizonBars: number): BarScore {
  const { action, entry, stopLoss, target } = decision;
  if (action === 'HOLD' || entry === null || stopLoss === null) return NO_TRADE;
  const long = action === 'BUY';
  const risk = Math.abs(entry - stopLoss);
  if (risk === 0 || (long ? stopLoss >= entry : stopLoss <= entry)) return NO_TRADE;
  const bars = future.slice(0, Math.max(0, Math.floor(horizonBars)));
  if (bars.length === 0) return { outcome: 'no-data', r: null, exitPrice: null };
  const result = (outcome: DeskOutcome, exit: number): BarScore => ({ outcome, r: round2((long ? exit - entry : entry - exit) / risk), exitPrice: exit });
  for (const b of bars) {
    if (long ? b.low <= stopLoss : b.high >= stopLoss) return result('stop', long ? Math.min(stopLoss, b.open) : Math.max(stopLoss, b.open));
    if (target !== null && (long ? b.high >= target : b.low <= target)) return result('target', target);
  }
  const last = bars[bars.length - 1];
  return result('timeout', last ? last.close : entry);
}

export function summarise(items: Array<{ outcome: DeskOutcome; r: number | null }>): DeskScoreSummary {
  const rs = items.flatMap((i) => (i.r === null ? [] : [i.r]));
  const holds = items.filter((i) => i.outcome === 'no-trade').length;
  let cumulative = 0, peak = 0, drawdown = 0;
  for (const r of rs) {
    cumulative += r;
    peak = Math.max(peak, cumulative);
    drawdown = Math.max(drawdown, peak - cumulative);
  }
  const total = rs.reduce((a, b) => a + b, 0);
  return { trades: rs.length, holds, hitRatePct: rs.length ? round2((rs.filter((r) => r > 0).length / rs.length) * 100) : null,
    avgR: rs.length ? round2(total / rs.length) : null, totalR: round2(total), maxDrawdownR: round2(drawdown) };
}
