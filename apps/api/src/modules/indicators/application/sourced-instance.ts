import type { Bar } from '@aitrader/contracts';
import type { SourcedBar } from '../domain/source';
import type { IndicatorInstance, PlotValues } from './ports/indicator-runtime';

const EMPTY: PlotValues = {};

/**
 * FR-IN-13: an indicator whose `source` is another indicator's plot. Each bar updates the parent first, then feeds its plot to the
 * child as the bar's `external` value. While the parent plot is `null` (warm-up) the child sees no bar and reports `null`, which equals
 * Pine's `na` propagation for the leading gap.
 */
export class SourcedInstance implements IndicatorInstance {
  /** True once the child holds a value for the newest bar, so a replace can recompute it instead of adding a bar. */
  private fed = false;

  constructor(private readonly child: IndicatorInstance, private readonly parent: IndicatorInstance, private readonly plot: string) {}

  get reason(): string | undefined { return this.child.reason ?? this.parent.reason; }

  async seed(bars: readonly Bar[]): Promise<PlotValues[]> {
    const parentRows = await this.parent.seed(bars);
    const rows: PlotValues[] = [];
    for (const [i, bar] of bars.entries()) rows.push(await this.feed(bar, parentRows[i]?.[this.plot] ?? null, false));
    return rows;
  }

  async update(bar: Bar, replace: boolean): Promise<PlotValues> {
    const parentRow = await this.parent.update(bar, replace);
    return this.feed(bar, parentRow[this.plot] ?? null, replace);
  }

  close(): void {
    this.parent.close();
    this.child.close();
  }

  private async feed(bar: Bar, value: number | null, replace: boolean): Promise<PlotValues> {
    if (!replace) this.fed = false;
    if (value === null || !Number.isFinite(value)) return EMPTY;
    const sourced: SourcedBar = { ...bar, external: value };
    const row = await this.child.update(sourced, replace && this.fed);
    this.fed = true;
    return row;
  }
}
