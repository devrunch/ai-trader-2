/** TradingView `offset`: a positive value moves the plot right by that many bars, a negative one left. */
export function shiftByOffset(values: readonly (number | null)[], offset: number): (number | null)[] {
  if (offset === 0) return [...values];
  return values.map((_, i) => values[i - offset] ?? null);
}

/**
 * The streaming form of `shiftByOffset`: each push paints one point. A positive offset paints the newest bar
 * from a bar `offset` back (so ticks never move it); a negative one paints an earlier bar from the newest value.
 */
export class OffsetStream {
  private readonly times: number[] = [];
  private readonly values: (number | null)[] = [];
  private readonly keep: number;
  constructor(private readonly offset: number) { this.keep = Math.abs(offset) + 1; }

  push(time: number, value: number | null, replace: boolean): { time: number; value: number | null } | null {
    if (replace && this.times.length) { this.values[this.values.length - 1] = value; }
    else {
      this.times.push(time); this.values.push(value);
      if (this.times.length > this.keep) { this.times.shift(); this.values.shift(); }
    }
    const last = this.times.length - 1;
    if (this.offset >= 0) return { time: time, value: this.values[last - this.offset] ?? null };
    const at = this.times[last + this.offset];
    return at === undefined ? null : { time: at, value };
  }
}
