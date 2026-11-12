import { z } from 'zod';
import { INTERVALS, IndicatorInputValuesSchema, type IndicatorComputeRequest, type IndicatorResult, type Interval } from '@aitrader/contracts';
import type { BacktestRequest, BacktestResponse } from '@aitrader/compute-client';
import { ValidationError } from '../../../shared/errors';
import { guardedTool, orJsonString, type GuardDeps, type GuardedTool, type ToolContext } from './guarded-tool';

const SYMBOL = z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/, 'canonical EXCHANGE:TICKER id');
const NAME = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/);
const Operand = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('series'), name: NAME, offset: z.number().int().min(0).max(500).optional() }),
  z.strictObject({ kind: z.literal('value'), value: z.number() }),
]);
type ConditionShape = { kind: 'compare'; left: z.infer<typeof Operand>; op: string; right: z.infer<typeof Operand> }
  | { kind: 'all' | 'any'; of: ConditionShape[] } | { kind: 'not'; of: ConditionShape };
const Condition: z.ZodType<ConditionShape> = z.lazy(() => z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('compare'), left: Operand, op: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'crossesAbove', 'crossesBelow']), right: Operand }),
  z.strictObject({ kind: z.literal('all'), of: z.array(Condition).min(1).max(20) }),
  z.strictObject({ kind: z.literal('any'), of: z.array(Condition).min(1).max(20) }),
  z.strictObject({ kind: z.literal('not'), of: Condition }),
]));
const Level = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('percent'), percent: z.number().positive().max(1000) }),
  z.strictObject({ kind: z.literal('series'), name: NAME, multiple: z.number().positive().max(100) }),
]);
const Strategy = z.strictObject({ side: z.enum(['long', 'short']).default('long'), entry: Condition, exit: Condition.optional(),
  stopLoss: Level.optional(), takeProfit: Level.optional() });

const BacktestInput = z.strictObject({
  symbol: SYMBOL, interval: z.enum(INTERVALS), bars: z.number().int().min(100).max(5000).default(2000),
  indicators: z.array(z.strictObject({ name: NAME, indicatorId: z.string().regex(/^[a-z][a-z0-9]{0,39}$/),
    inputs: orJsonString(IndicatorInputValuesSchema).default({}), plot: z.string().max(40).optional() })).max(6).default([]),
  strategy: orJsonString(Strategy),
  costs: z.strictObject({ commissionPct: z.number().min(0).max(5), slippagePct: z.number().min(0).max(5) }).default({ commissionPct: 0.03, slippagePct: 0.02 }),
});

interface BarsSource { bars(id: string, interval: Interval, cursor: { latest: true }, limit: number): Promise<{ bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number | null }> }> }
export interface BacktestDesk {
  market: BarsSource;
  compute(request: IndicatorComputeRequest): Promise<IndicatorResult>;
  /** null: COMPUTE_URL is not set. */
  backtest: { execute(request: BacktestRequest, signal: AbortSignal): Promise<BacktestResponse> } | null;
}

const round = (n: number | null, d = 2) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

/** Strategy backtests on real bars with indicator series computed by the server, run by the Python compute service (Lambda). */
export function buildBacktestTools(desk: BacktestDesk, deps: GuardDeps, onResult?: (ctx: ToolContext, summary: string) => void): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'runBacktest',
    description: 'Backtest a rule-based strategy on real bars: name indicator series (e.g. {name:"ema20", indicatorId:"ema", inputs:{length:20}}) and use them, '
      + 'or bar fields open/high/low/close/volume, in entry/exit conditions (compare with gt/lt/crossesAbove/crossesBelow, combine with all/any/not); '
      + 'stopLoss/takeProfit as percent or a series multiple (e.g. ATR). Pessimistic fills, costs on every fill. '
      + 'Always report drawdown, trade count, costs and the out-of-sample split with any return; say when the sample is too small or results are a coin flip.',
    input: BacktestInput,
    run: async (input, ctx) => {
      if (!desk.backtest) throw new ValidationError('Backtesting is not configured on this server (COMPUTE_URL)');
      const { bars } = await desk.market.bars(input.symbol, input.interval, { latest: true }, input.bars);
      if (bars.length < 100) throw new ValidationError(`Only ${String(bars.length)} bars for ${input.symbol} ${input.interval}; need at least 100`);
      const series: Record<string, Array<number | null>> = {};
      for (const ind of input.indicators) {
        const result = await desk.compute({ symbol: input.symbol, interval: input.interval, indicator: { kind: 'builtin', id: ind.indicatorId, inputs: ind.inputs },
          range: { limit: bars.length } });
        const plot = ind.plot ? result.plots.find(p => p.id === ind.plot) : result.plots[0];
        if (!plot) throw new ValidationError(`${ind.indicatorId} has no plot "${ind.plot ?? ''}"; plots: ${result.plots.map(p => p.id).join(', ')}`);
        const byTime = new Map(result.times.map((t, i) => [t, plot.values[i] ?? null]));
        series[ind.name] = bars.map(b => byTime.get(b.time) ?? null);
      }
      const response = await desk.backtest.execute({ bars, series, strategy: input.strategy as BacktestRequest['strategy'], costs: input.costs }, AbortSignal.timeout(28_000));
      const m = response.metrics;
      onResult?.(ctx, `${input.symbol} ${input.interval}, ${String(bars.length)} bars: return ${String(round(m.totalReturnPct))}%, max drawdown ${String(round(m.maxDrawdownPct))}%, ${String(m.tradeCount)} trades, profit factor ${String(round(m.profitFactor))}`);
      return {
        sample: { symbol: input.symbol, interval: input.interval, bars: bars.length, from: new Date(bars[0]?.time ?? 0).toISOString(), to: new Date(bars.at(-1)?.time ?? 0).toISOString() },
        costs: input.costs,
        metrics: { totalReturnPct: round(m.totalReturnPct), maxDrawdownPct: round(m.maxDrawdownPct), tradeCount: m.tradeCount, profitFactor: round(m.profitFactor),
          sharpe: round(m.sharpe), exposurePct: round(m.exposurePct), cagrPct: round(m.cagrPct) },
        inSample: response.inSample, outOfSample: response.outOfSample, signals: response.signals,
        lastTrades: response.trades.slice(-8).map(t => ({ entry: new Date(t.entryTime).toISOString(), exit: new Date(t.exitTime).toISOString(), entryPrice: t.entryPrice,
          exitPrice: t.exitPrice, pnl: round(t.pnl), exitReason: t.exitReason, barsHeld: t.barsHeld })),
      };
    } }, deps)];
}
