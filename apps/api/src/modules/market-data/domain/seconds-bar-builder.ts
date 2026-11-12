import type { Bar } from './bar';
import { intervalSeconds, type SecondInterval } from './interval';

interface Tick { at: number; price: number; cumVolume: number | null }

/** Rolls ticks into one second-interval series: epoch-aligned buckets, no bar for a second without ticks. */
export class SecondsBarBuilder {
  private readonly size: number;
  private current: Bar | null = null;
  private lastCum: number | null = null;
  constructor(interval: SecondInterval) { this.size = intervalSeconds(interval) * 1000; }

  onTick(t: Tick): { updated?: Bar; closed?: Bar[] } {
    const time = Math.floor(t.at / this.size) * this.size;
    if (this.current && time < this.current.time) return {};
    const closed: Bar[] = [];
    if (this.current && time > this.current.time) { closed.push(this.current); this.current = null; }
    const delta = t.cumVolume !== null && this.lastCum !== null ? Math.max(0, t.cumVolume - this.lastCum) : 0;
    this.lastCum = t.cumVolume;
    const bar = this.current ?? { time, open: t.price, high: t.price, low: t.price, close: t.price, volume: t.cumVolume === null ? null : 0 };
    bar.high = Math.max(bar.high, t.price); bar.low = Math.min(bar.low, t.price); bar.close = t.price;
    if (t.cumVolume === null) bar.volume = null;
    else if (bar.volume !== null) bar.volume += delta;
    this.current = bar;
    return { updated: { ...bar }, ...(closed.length ? { closed } : {}) };
  }

  closeDue(now: number): Bar[] {
    if (!this.current || now < this.current.time + this.size) return [];
    const bar = this.current; this.current = null;
    return [bar];
  }

  forming(): Bar | null { return this.current ? { ...this.current } : null; }
}
