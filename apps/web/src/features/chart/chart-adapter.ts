import type { Bar } from '@aitrader/contracts';

export interface ChartColors { up: string; down: string; text: string; grid: string; background: string }
interface CandlePoint { time: number; open: number; high: number; low: number; close: number }
export type VolumePoint = { time: number; value: number; color: string } | { time: number };
export type LinePoint = { time: number; value: number; color?: string } | { time: number };
/** How one plot looks; changing it repaints the series in place. */
export interface SeriesStyle { visible: boolean; color: string; lineWidth: number; lineStyle: 'solid' | 'dashed' | 'dotted'; type: 'line' | 'step' | 'histogram' | 'circles' | 'area' | 'columns'; precision: number | null }
/** `kind` picks the series class and never changes; the rest is the style it starts with. */
export interface IndicatorSeriesOptions extends SeriesStyle { kind: 'line' | 'histogram' | 'area' | 'step' | 'circles'; pane: number; title: string }
export interface LevelLine { value: number; title: string; color: string; lineStyle: SeriesStyle['lineStyle'] }
export interface IndicatorSeriesLike {
  setData: (points: LinePoint[]) => void; update: (point: LinePoint) => void; applyStyle: (style: SeriesStyle) => void;
  /** Replaces the series' level lines. */
  setLevels: (levels: readonly LevelLine[]) => void; remove: () => void;
}

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
  /** Bar replay: the newest bar shown (ms). Live bars keep arriving and are held back until replay ends. */
  private replayAt: number | null = null;
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
    this.paintAll();
  }

  update(bar: Bar): void {
    const last = this.bars.at(-1);
    if (last && last.time === bar.time) this.bars[this.bars.length - 1] = bar; else this.bars.push(bar);
    if (this.replayAt !== null) return;
    this.chart.candles.update(candle(bar));
    this.chart.volume.update(this.volume(bar));
  }

  /** Replay from the bar at `time` (ms): later bars disappear until stepped through. Returns the bar time shown, or null. */
  replayFrom(time: number): number | null {
    const at = this.bars.findLast(b => b.time <= time) ?? this.bars[0];
    if (!at) return null;
    this.replayAt = at.time;
    this.paintAll();
    return at.time;
  }

  /** One bar forward or back; forward adds the bar the way a live close would. Returns the bar time now shown. */
  replayStep(direction: 1 | -1): number | null {
    if (this.replayAt === null) return null;
    const i = this.bars.findIndex(b => b.time === this.replayAt);
    const next = this.bars[Math.min(this.bars.length - 1, Math.max(0, i + direction))];
    if (!next || next.time === this.replayAt) return this.replayAt;
    this.replayAt = next.time;
    if (direction === 1) { this.chart.candles.update(candle(next)); this.chart.volume.update(this.volume(next)); } else this.paintAll();
    return next.time;
  }

  /** True when replay has reached the newest bar. */
  replayAtEnd(): boolean { return this.replayAt !== null && this.replayAt === this.bars.at(-1)?.time; }

  replayStop(): void { this.replayAt = null; this.paintAll(); }

  private paintAll(): void {
    const shown = this.replayAt === null ? this.bars : this.bars.filter(b => b.time <= (this.replayAt ?? 0));
    this.chart.candles.setData(shown.map(candle));
    this.chart.volume.setData(shown.map(b => this.volume(b)));
  }

  applyColors(colors: ChartColors): void {
    this.colors = colors;
    this.chart.applyColors(colors);
    this.paintAll();
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
