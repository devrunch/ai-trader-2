import type { BacktestResult } from '@aitrader/contracts';
import { EquityChart } from './equity-chart';
import { TradesTable } from './trades-table';

type Metrics = BacktestResult['metrics'];
const pct = (v: number | null): string => (v === null ? '—' : `${v.toFixed(2)}%`);
const num = (v: number | null): string => (v === null ? '—' : v.toFixed(2));

function MetricList({ title, metrics }: { title: string; metrics: Metrics | undefined }) {
  return <section aria-label={title} className="min-w-0 flex-1 rounded border p-2">
    <h4 className="mb-1 font-semibold">{title}</h4>
    {metrics ? <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
      <dt>Return</dt><dd className="num">{pct(metrics.totalReturnPct)}</dd>
      <dt>Max drawdown</dt><dd className="num">{pct(metrics.maxDrawdownPct)}</dd>
      <dt>Trades</dt><dd className="num">{metrics.tradeCount}</dd>
      <dt>Profit factor</dt><dd className="num">{num(metrics.profitFactor)}</dd>
      <dt>Sharpe</dt><dd className="num">{num(metrics.sharpe)}</dd>
      <dt>Exposure</dt><dd className="num">{pct(metrics.exposurePct)}</dd>
    </dl> : <p className="text-muted-foreground">Not available: the sample is too short to hold data back for an out-of-sample check.</p>}
  </section>;
}

export function BacktestResults({ result, variants }: { result: BacktestResult; variants: number | null }) {
  return <div className="space-y-3 text-[12px]">
    <div className="flex flex-wrap items-baseline gap-x-3">
      <span className="font-semibold">{result.sample.symbol} · {result.sample.bars} bars</span>
      {variants !== null && <span>{variants} variants tried</span>}
      <span className="text-muted-foreground">costs {result.costs.commissionPct}% + {result.costs.slippagePct}% slippage</span>
    </div>
    {variants !== null && <p className="text-[11px] text-muted-foreground">More variants tried means a higher risk the result is overfit; judge by out-of-sample.</p>}
    <MetricList title="Whole sample" metrics={result.metrics} />
    <div className="flex flex-wrap gap-2">
      <MetricList title="In-sample" metrics={result.inSample?.metrics} />
      <MetricList title="Out-of-sample" metrics={result.outOfSample?.metrics} />
    </div>
    {result.equity.length > 1 ? <EquityChart points={result.equity} /> : <p className="text-muted-foreground">No equity curve: there were no trades.</p>}
    <TradesTable trades={result.trades} />
  </div>;
}
