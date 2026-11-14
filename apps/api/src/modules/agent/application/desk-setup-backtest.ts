import type { BacktestResult, BacktestSpec, DeskDecision } from '@aitrader/contracts';
import { noteOf } from './backtest-tools';
import type { BacktestNote } from '../domain/auto-trade';

export type SetupBacktest = (symbol: string, decision: DeskDecision) => Promise<BacktestNote>;

/**
 * The rule backtest of a trader's setup: a trend entry (close crossing the 20-bar EMA in the trade's direction) with the trader's own stop and target distances,
 * so it tests whether that risk geometry has paid on this instrument. The desk's free-text reasoning cannot be turned into rules, so this is the closest testable form.
 */
export function setupSpec(symbol: string, d: DeskDecision & { entry: number; stopLoss: number }): BacktestSpec {
  const long = d.action === 'BUY';
  const pct = (level: number): number => Math.max(0.01, Math.round((Math.abs(level - d.entry) / d.entry) * 10_000) / 100);
  return { symbol, interval: '15', bars: 2000, indicators: [{ name: 'ema20', indicatorId: 'ema', inputs: { length: 20 } }], costs: { commissionPct: 0.03, slippagePct: 0.02 },
    strategy: { side: long ? 'long' : 'short', entry: { kind: 'compare', left: { kind: 'series', name: 'close' }, op: long ? 'crossesAbove' : 'crossesBelow', right: { kind: 'series', name: 'ema20' } },
      stopLoss: { kind: 'percent', percent: pct(d.stopLoss) }, ...(d.target === null ? {} : { takeProfit: { kind: 'percent', percent: pct(d.target) } }) } };
}

export const buildSetupBacktest = (runner: { run(spec: BacktestSpec): Promise<BacktestResult> }): SetupBacktest => async (symbol, decision) => {
  if (decision.entry === null || decision.stopLoss === null) throw new Error('The decision has no entry and stop to backtest');
  return noteOf(await runner.run(setupSpec(symbol, { ...decision, entry: decision.entry, stopLoss: decision.stopLoss })));
};
