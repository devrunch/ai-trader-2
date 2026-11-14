import { z } from 'zod';
import { BacktestIndicatorSchema, BacktestRulesSchema, BacktestSpecSchema, IndicatorInputValuesSchema, StrategyNameSchema, type BacktestResult, type BacktestSpec, type StrategyDto } from '@aitrader/contracts';
import type { BacktestNote } from '../domain/auto-trade';
import { guardedTool, orJsonString, type GuardDeps, type GuardedTool, type ToolContext } from './guarded-tool';

/** The model may pass nested parts as JSON strings; they are parsed into the same spec the Strategies page saves. */
const SpecInput = z.strictObject({
  symbol: BacktestSpecSchema.shape.symbol, interval: BacktestSpecSchema.shape.interval, bars: BacktestSpecSchema.shape.bars,
  indicators: z.array(z.strictObject({ ...BacktestIndicatorSchema.shape, inputs: orJsonString(IndicatorInputValuesSchema).default({}) })).max(6).default([]),
  strategy: orJsonString(BacktestRulesSchema), costs: BacktestSpecSchema.shape.costs,
});

export interface BacktestDesk {
  runner: { run(spec: BacktestSpec): Promise<BacktestResult> };
  strategies: { create(userId: string, input: { name: string; spec: BacktestSpec }): Promise<StrategyDto> };
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** What a backtest found, as the one line the trade journal keeps and the numbers the auto-trade gate judges. */
export function noteOf(result: BacktestResult): BacktestNote {
  const { metrics: m, sample } = result;
  return { symbol: sample.symbol, interval: sample.interval, profitFactor: m.profitFactor, tradeCount: m.tradeCount,
    summary: `${sample.symbol} ${sample.interval}, ${String(sample.bars)} bars: return ${String(m.totalReturnPct)}%, max drawdown ${String(m.maxDrawdownPct)}%, ${String(m.tradeCount)} trades, profit factor ${String(m.profitFactor)}` };
}

/** Strategy backtests on real bars with indicator series computed by the server, run by the Python compute service (Lambda); and saving a strategy for the user. */
export function buildBacktestTools(desk: BacktestDesk, deps: GuardDeps, onResult?: (ctx: ToolContext, note: BacktestNote) => void): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'runBacktest',
      description: 'Backtest a rule-based strategy on real bars: name indicator series (e.g. {name:"ema20", indicatorId:"ema", inputs:{length:20}}) and use them, '
        + 'or bar fields open/high/low/close/volume, in entry/exit conditions (compare with gt/lt/crossesAbove/crossesBelow, combine with all/any/not); '
        + 'stopLoss/takeProfit as percent or a series multiple (e.g. ATR). Pessimistic fills, costs on every fill. '
        + 'Always report drawdown, trade count, costs and the out-of-sample split with any return; say when the sample is too small or results are a coin flip.',
      input: SpecInput,
      run: async (input, ctx) => {
        const result = await desk.runner.run(input);
        onResult?.(ctx, noteOf(result));
        const { sample, costs, metrics, inSample, outOfSample, signals, trades } = result;
        return { sample, costs, metrics, inSample, outOfSample, signals, lastTrades: trades.slice(-8).map(t => ({ entry: iso(t.entryTime), exit: iso(t.exitTime), entryPrice: t.entryPrice, exitPrice: t.exitPrice, pnl: t.pnl,
          exitReason: t.exitReason, barsHeld: t.barsHeld })) };
      } }, deps),
    guardedTool({ name: 'saveStrategy',
      description: 'Save a backtest setup as one of the user\'s strategies (same fields as runBacktest, plus a name), so they can open it on the Strategies page and run variants. Only when the user asks.',
      input: z.strictObject({ name: StrategyNameSchema, ...SpecInput.shape }),
      run: ({ name, ...spec }, ctx) => desk.strategies.create(ctx.userId, { name, spec }) }, deps),
  ];
}
