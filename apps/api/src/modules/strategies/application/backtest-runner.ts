import type { BacktestRequest, BacktestResponse } from '@aitrader/compute-client';
import type { BacktestResult, BacktestSpec, IndicatorComputeRequest, IndicatorResult, Interval } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';

interface BarsSource { bars(id: string, interval: Interval, cursor: { latest: true }, limit: number): Promise<{ bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number | null }> }> }
export interface BacktestDesk {
  market: BarsSource;
  compute(request: IndicatorComputeRequest): Promise<IndicatorResult>;
  /** null: COMPUTE_URL is not set. */
  backtest: { execute(request: BacktestRequest, signal: AbortSignal): Promise<BacktestResponse> } | null;
}

const MAX_TRADES = 300;
const MAX_POINTS = 500;
const round = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;
const roundOrNull = (n: number | null): number | null => (n === null ? null : round(n));

type Metrics = BacktestResponse['metrics'];
const metricsOf = (m: Metrics): BacktestResult['metrics'] => ({ totalReturnPct: round(m.totalReturnPct), maxDrawdownPct: round(m.maxDrawdownPct), tradeCount: m.tradeCount,
  profitFactor: roundOrNull(m.profitFactor), sharpe: roundOrNull(m.sharpe), exposurePct: round(m.exposurePct), cagrPct: roundOrNull(m.cagrPct), winRatePct: roundOrNull(m.winRatePct) });
const segment = (s: BacktestResponse['inSample']): BacktestResult['inSample'] => (s === null ? null : { startTime: s.startTime, endTime: s.endTime, metrics: metricsOf(s.metrics) });
const thin = <T>(items: T[], max: number): T[] => (items.length <= max ? items : Array.from({ length: max }, (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))] as T));

/** One backtest on real bars with indicator series computed by the server, run by the Python compute service (Lambda). Used by the Strategies page and the assistant. */
export class BacktestRunner {
  constructor(private readonly desk: BacktestDesk) {}

  async run(spec: BacktestSpec, signal: AbortSignal = AbortSignal.timeout(28_000)): Promise<BacktestResult> {
    if (!this.desk.backtest) throw new ValidationError('Backtesting is not configured on this server (COMPUTE_URL)');
    const { bars } = await this.desk.market.bars(spec.symbol, spec.interval, { latest: true }, spec.bars);
    if (bars.length < 100) throw new ValidationError(`Only ${String(bars.length)} bars for ${spec.symbol} ${spec.interval}; need at least 100`);
    const series: Record<string, Array<number | null>> = {};
    for (const ind of spec.indicators) {
      const result = await this.desk.compute({ symbol: spec.symbol, interval: spec.interval, indicator: { kind: 'builtin', id: ind.indicatorId, inputs: ind.inputs },
        range: { limit: bars.length } });
      const plot = ind.plot ? result.plots.find(p => p.id === ind.plot) : result.plots[0];
      if (!plot) throw new ValidationError(`${ind.indicatorId} has no plot "${ind.plot ?? ''}"; plots: ${result.plots.map(p => p.id).join(', ')}`);
      const byTime = new Map(result.times.map((t, i) => [t, plot.values[i] ?? null]));
      series[ind.name] = bars.map(b => byTime.get(b.time) ?? null);
    }
    const response = await this.desk.backtest.execute({ bars, series, strategy: spec.strategy as BacktestRequest['strategy'], costs: spec.costs }, signal);
    return {
      sample: { symbol: spec.symbol, interval: spec.interval, bars: bars.length, from: new Date(bars[0]?.time ?? 0).toISOString(), to: new Date(bars.at(-1)?.time ?? 0).toISOString() },
      costs: spec.costs, metrics: metricsOf(response.metrics), inSample: segment(response.inSample), outOfSample: segment(response.outOfSample), signals: response.signals,
      trades: response.trades.slice(-MAX_TRADES).map(t => ({ entryTime: t.entryTime, entryPrice: t.entryPrice, exitTime: t.exitTime, exitPrice: t.exitPrice, pnl: round(t.pnl),
        returnPct: round(t.returnPct), barsHeld: t.barsHeld, exitReason: t.exitReason, side: t.side })),
      equity: thin(response.equity, MAX_POINTS).map(p => ({ time: p.time, equity: round(p.equity) })),
    };
  }
}
