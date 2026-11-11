import type { Bar } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';
import { OffsetStream } from '../domain/offset';
import type { IndicatorInstance, PlotValues } from './ports/indicator-runtime';

export interface IndicatorPoint { barTime: number; values: Record<string, number | null> }

/** Live updates for one indicator instance: a bar at the last time replaces it, a newer one is added (FR-IN-5/6). */
export class IndicatorStream {
  private readonly offsets: Map<string, OffsetStream>;
  private queue: Promise<unknown> = Promise.resolve();
  /** The newest push that has not started computing; a tick for the same bar overwrites it. */
  private waiting: { bar: Bar; promise: Promise<IndicatorPoint | null> } | null = null;

  constructor(private readonly instance: IndicatorInstance, plots: readonly string[], offsets: Readonly<Record<string, number>>,
    history: { times: readonly number[]; rows: readonly PlotValues[] }, private lastTime: number | undefined) {
    this.offsets = new Map(plots.map(id => [id, new OffsetStream(offsets[id] ?? 0)]));
    const start = Math.max(0, history.times.length - Math.max(0, ...Object.values(offsets).map(Math.abs)) - 1);
    for (let i = start; i < history.times.length; i++) {
      for (const [id, stream] of this.offsets) stream.push(history.times[i] ?? 0, history.rows[i]?.[id] ?? null, false);
    }
  }

  /** Serialised, so a caller that does not wait still applies ticks in arrival order. An instance with `latestWins` computes only the newest of the ticks for one bar that queue behind a running one (FR-IN-30). */
  push(bar: Bar): Promise<IndicatorPoint | null> {
    if (this.instance.latestWins && this.waiting?.bar.time === bar.time) {
      this.waiting.bar = bar;
      return this.waiting.promise;
    }
    const entry = { bar, promise: Promise.resolve<IndicatorPoint | null>(null) };
    entry.promise = this.queue.then(() => {
      if (this.waiting === entry) this.waiting = null;
      return this.apply(entry.bar);
    });
    this.waiting = entry;
    this.queue = entry.promise.catch(() => undefined);
    return entry.promise;
  }

  close(): void { this.instance.close(); }

  private async apply(bar: Bar): Promise<IndicatorPoint | null> {
    if (this.lastTime !== undefined && bar.time < this.lastTime) {
      throw new ValidationError('Bar is older than the last bar', { barTime: bar.time, lastBarTime: this.lastTime });
    }
    const replace = bar.time === this.lastTime;
    const row = await this.instance.update(bar, replace);
    this.lastTime = bar.time;
    const byTime = new Map<number, Record<string, number | null>>();
    for (const [id, stream] of this.offsets) {
      const point = stream.push(bar.time, row[id] ?? null, replace);
      if (point) byTime.set(point.time, { ...byTime.get(point.time), [id]: point.value });
    }
    // Plots shifted into older bars (a negative offset) are left to the next full run; only the newest bar's plots are live.
    const newest = Math.max(...byTime.keys());
    const values = byTime.get(newest);
    return values ? { barTime: newest, values } : null;
  }
}
