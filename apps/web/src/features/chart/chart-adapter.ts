import type { Bar } from '@aitrader/contracts';

export interface ChartColors { up: string; down: string; text: string; grid: string; background: string }
interface CandlePoint { time: number; open: number; high: number; low: number; close: number }
export type VolumePoint = { time: number; value: number; color: string } | { time: number };
export type LinePoint = { time: number; value: number } | { time: number };
export interface IndicatorSeriesOptions { kind: 'line' | 'histogram' | 'area' | 'step' | 'circles'; color: string; lineWidth: number; pane: number; title: string }
export interface IndicatorSeriesLike { setData: (points: LinePoint[]) => void; update: (point: LinePoint) => void; priceLine: (value: number, title: string, color: string) => void; remove: () => void }

/** The slice of the charting library we use, so the adapter is testable without a canvas. */
export interface ChartLike {
  candles: { setData(points: CandlePoint[]): void; update(point: CandlePoint): void };
  volume: { setData(points: VolumePoint[]): void; update(point: VolumePoint): void };
  /** Calls back with the visible range's left logical index (null when empty); returns an unsubscribe. */
  onVisibleRange(cb: (from: number | null) => void): () => void;
  /** Calls back with the hovered bar's time in seconds, or null when the pointer leaves; returns an unsubscribe. */
  onCrosshair(cb: (time: number | null) => void): () => void;
  applyColors(colors: ChartColors): void;
  /** Pane 0 is the price pane, 1 volume; indicator panes follow. */
  addIndicatorSeries(options: IndicatorSeriesOptions): IndicatorSeriesLike;
  remove(): void;
}

const NEAR_LEFT_EDGE = 10;

/** Feeds bars into the chart imperatively (ticks never pass through React state) and asks for older pages. */
export class ChartAdapter {
  private bars: Bar[] = [];
  private requestedBefore: number | undefined;
  private needOlder: ((before: number) => void) | undefined;
  private readonly unsubscribe: () => void;

  constructor(private readonly chart: ChartLike, private colors: ChartColors) {
    chart.applyColors(colors);
    this.unsubscribe = chart.onVisibleRange(from => { this.onRange(from); });
  }

  onNeedOlder(cb: (before: number) => void): void { this.needOlder = cb; }

  /** Times (ms) inside the span the chart holds that it has no bar for; older ones are just not paged in yet. */
  missingTimes(times: readonly number[]): number[] {
    const oldest = this.bars[0]?.time;
    if (oldest === undefined) return [];
    const held = new Set(this.bars.map(b => b.time));
    return times.filter(time => time >= oldest && !held.has(time));
  }

  /** The bar under the pointer (or null when not hovering) and the newest bar, for the OHLC legend. */
  onLegend(cb: (hovered: { bar: Bar; prevClose: number | undefined } | null) => void): () => void {
    return this.chart.onCrosshair(time => {
      const i = time === null ? -1 : this.bars.findIndex(b => b.time === time * 1000);
      const bar = this.bars[i];
      cb(bar ? { bar, prevClose: this.bars[i - 1]?.close } : null);
    });
  }


  reset(bars: Bar[]): void {
    this.bars = bars;
    this.chart.candles.setData(bars.map(candle));
    this.chart.volume.setData(bars.map(b => this.volume(b)));
  }

  update(bar: Bar): void {
    const last = this.bars.at(-1);
    if (last && last.time === bar.time) this.bars[this.bars.length - 1] = bar; else this.bars.push(bar);
    this.chart.candles.update(candle(bar));
    this.chart.volume.update(this.volume(bar));
  }

  applyColors(colors: ChartColors): void {
    this.colors = colors;
    this.chart.applyColors(colors);
    this.chart.volume.setData(this.bars.map(b => this.volume(b)));
  }

  destroy(): void { this.unsubscribe(); this.chart.remove(); }

  private onRange(from: number | null): void {
    const oldest = this.bars[0]?.time;
    if (from === null || oldest === undefined || from > NEAR_LEFT_EDGE || this.requestedBefore === oldest) return;
    this.requestedBefore = oldest;
    this.needOlder?.(oldest);
  }

  private volume(bar: Bar): VolumePoint {
    const time = bar.time / 1000;
    return bar.volume === null ? { time } : { time, value: bar.volume, color: bar.close >= bar.open ? this.colors.up : this.colors.down };
  }
}

const candle = (bar: Bar): CandlePoint => ({ time: bar.time / 1000, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
