import type { IndicatorComputeRequest, IndicatorResult, TaskTrigger } from '@aitrader/contracts';
import type { ConditionReader } from '../application/agent-tasks';

type Condition = Exclude<TaskTrigger, { kind: 'schedule' }>;

/** Prices from the quote service; indicator values from the one indicator engine, newest non-empty value of the plot. */
export class MarketConditionReader implements ConditionReader {
  constructor(private readonly quote: { execute(id: string): Promise<{ price: number }> },
    private readonly indicators: { compute(request: IndicatorComputeRequest): Promise<IndicatorResult> }) {}

  async read(trigger: Condition): Promise<number | undefined> {
    if (trigger.kind === 'price') return (await this.quote.execute(trigger.symbol)).price;
    const result = await this.indicators.compute({ symbol: trigger.symbol, interval: trigger.interval,
      indicator: { kind: 'builtin', id: trigger.indicatorId, inputs: trigger.inputs }, range: { limit: 500 } });
    const plot = trigger.plot ? result.plots.find(p => p.id === trigger.plot) : result.plots[0];
    return plot?.values.findLast((v): v is number => v !== null);
  }
}
