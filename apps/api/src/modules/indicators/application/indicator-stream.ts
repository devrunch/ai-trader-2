import type { Bar } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';
import { OffsetStream } from '../domain/offset';
import type { IndicatorInstance, PlotValues } from './ports/indicator-runtime';

export interface IndicatorPoint { barTime: number; values: Record<string, number | null> }

/** Live updates for one indicator instance: a bar at the last time replaces it, a newer one is added (FR-IN-5/6). */
export class IndicatorStream {
  private readonly offsets: Map<string, OffsetStream>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly instance: IndicatorInstance, plots: readonly string[], offset: number,
    history: { times: readonly number[]; rows: readonly PlotValues[] }, private lastTime: number | undefined) {
    this.offsets = new Map(plots.map(id => [id, new OffsetStream(offset)]));
    const start = Math.max(0, history.times.length - Math.abs(offset) - 1);
    for (let i = start; i < history.times.length; i++) {
      for (const [id, stream] of this.offsets) stream.push(history.times[i] ?? 0, history.rows[i]?.[id] ?? null, false);
    }
  }

  /** Serialised, so a caller that does not wait still applies ticks in arrival order. */
  push(bar: Bar): Promise<IndicatorPoint | null> {
    const next = this.queue.then(() => this.apply(bar));
    this.queue = next.catch(() => undefined);
    return next;
  }

  close(): void { this.instance.close(); }

  private async apply(bar: Bar): Promise<IndicatorPoint | null> {
    if (this.lastTime !== undefined && bar.time < this.lastTime) {
      throw new ValidationError('Bar is older than the last bar', { barTime: bar.time, lastBarTime: this.lastTime });
    }
    const replace = bar.time === this.lastTime;
    const row = await this.instance.update(bar, replace);
    this.lastTime = bar.time;
    let barTime: number | null = null;
    const values: Record<string, number | null> = {};
    for (const [id, stream] of this.offsets) {
      const point = stream.push(bar.time, row[id] ?? null, replace);
      if (!point) continue;
      barTime = point.time;
      values[id] = point.value;
    }
    return barTime === null ? null : { barTime, values };
  }
}
