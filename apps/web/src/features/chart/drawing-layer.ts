import type { Drawing } from '@aitrader/contracts';
import type { ChartLike, IndicatorSeriesLike } from './chart-adapter';

/** Server-computed drawings on the price pane: one two-point line per segment, labelled on the price axis (FR-AG-6). */
export class DrawingLayer {
  private series: IndicatorSeriesLike[] = [];

  constructor(private readonly chart: Pick<ChartLike, 'addIndicatorSeries'>, private readonly color: (token: string) => string) {}

  set(drawings: readonly Drawing[]): void {
    this.clear();
    for (const drawing of drawings) {
      for (const segment of drawing.segments) {
        const handle = this.chart.addIndicatorSeries({ kind: 'line', type: 'line', visible: true, lineStyle: 'solid', precision: null, color: this.color('yellow'), lineWidth: 1, pane: 0, title: segment.label });
        const from = { time: segment.from.time / 1000, value: segment.from.price };
        const to = { time: segment.to.time / 1000, value: segment.to.price };
        handle.setData(from.time < to.time ? [from, to] : [to]);
        this.series.push(handle);
      }
    }
  }

  destroy(): void { this.clear(); }

  private clear(): void { for (const s of this.series) s.remove(); this.series = []; }
}
