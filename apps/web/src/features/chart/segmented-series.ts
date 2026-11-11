import type { IndicatorSeriesLike, LinePoint } from './chart-adapter';

interface Run { series: IndicatorSeriesLike; first: number; last: number }

/**
 * One plot drawn as one series per run of values. Lightweight Charts joins the points either side of a whitespace
 * point, so a null (Pine `na`) can only break the line by ending the series.
 */
export class SegmentedSeries implements IndicatorSeriesLike {
  private readonly base: IndicatorSeriesLike;
  private runs: Run[] = [];
  private idle: IndicatorSeriesLike[];
  private open = false;

  constructor(private readonly create: () => IndicatorSeriesLike) { this.base = create(); this.idle = [this.base]; }

  setData(points: LinePoint[]): void {
    const spans: { points: LinePoint[]; first: number; last: number }[] = [];
    let current: (typeof spans)[number] | undefined;
    for (const point of points) {
      if (!('value' in point)) { current = undefined; continue; }
      if (!current) { current = { points: [], first: point.time, last: point.time }; spans.push(current); }
      current.points.push(point);
      current.last = point.time;
    }
    const pool = [...this.runs.map(run => run.series), ...this.idle];
    this.runs = spans.map(span => {
      const series = pool.shift() ?? this.create();
      series.setData(span.points);
      return { series, first: span.first, last: span.last };
    });
    this.idle = [];
    for (const series of pool) { if (series === this.base) { series.setData([]); this.idle.push(series); } else series.remove(); }
    const tail = points.at(-1);
    this.open = tail !== undefined && 'value' in tail;
  }

  update(point: LinePoint): void {
    const run = this.runs.at(-1);
    if (!('value' in point)) {
      if (!this.open || !run) return;
      run.series.update(point);
      this.open = false;
      if (run.first === point.time) { this.runs.pop(); this.idle.push(run.series); }
      return;
    }
    if (this.open && run) { run.series.update(point); run.last = point.time; return; }
    if (run?.last === point.time) { run.series.update(point); this.open = true; return; }
    const series = this.idle.pop() ?? this.create();
    series.update(point);
    this.runs.push({ series, first: point.time, last: point.time });
    this.open = true;
  }

  priceLine(value: number, title: string, color: string): void { this.base.priceLine(value, title, color); }

  remove(): void {
    for (const series of new Set([...this.runs.map(run => run.series), ...this.idle])) series.remove();
    this.runs = []; this.idle = []; this.open = false;
  }
}
