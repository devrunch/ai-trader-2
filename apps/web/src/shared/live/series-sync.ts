import type { Bar } from '@aitrader/contracts';

export type ApplyResult = 'applied' | 'stale' | 'gap';

/**
 * One chart series' bars, kept exactly in step with the server (FR-LS-4):
 * updates apply in `seq` order, bars merge by `time`, and the server's values always win.
 */
export class SeriesSync {
  private readonly bars = new Map<number, Bar>();
  private seq = 0;
  private newest: number | undefined;

  constructor(private readonly view: { onReset(bars: Bar[]): void; onUpdate(bar: Bar): void }) {}

  lastSeq(): number { return this.seq; }

  lastBarTime(): number | undefined { return this.newest; }

  /** Older history survives only if it overlaps the snapshot; otherwise it would draw a hole. */
  applySnapshot(bars: readonly Bar[], seq: number): void {
    const oldest = bars.reduce<number | undefined>((min, bar) => (min === undefined || bar.time < min ? bar.time : min), undefined);
    const newestKept = this.lastBarTime();
    if (oldest === undefined || newestKept === undefined || newestKept < oldest) this.bars.clear();
    else for (const time of [...this.bars.keys()]) if (time >= oldest) this.bars.delete(time);
    for (const bar of bars) this.bars.set(bar.time, bar);
    this.newest = undefined; // snapshots are rare: recount once instead of tracking deletions
    for (const time of this.bars.keys()) this.track(time);
    this.seq = seq;
    this.reset();
  }

  applyBar(seq: number, bar: Bar): ApplyResult {
    if (seq <= this.seq) return 'stale';
    if (seq > this.seq + 1) return 'gap';
    this.seq = seq;
    const newest = this.newest;
    this.put(bar);
    // A chart can only append or replace its last bar; anything older is redrawn.
    if (newest === undefined || bar.time >= newest) this.view.onUpdate(bar);
    else this.reset();
    return 'applied';
  }

  /** Stored history (repairs included) overwrites what we hold, except the newest bar: its live value is fresher. */
  mergeHistory(bars: readonly Bar[]): void {
    const newest = this.lastBarTime();
    let changed = false;
    for (const bar of bars) {
      const held = this.bars.get(bar.time);
      if (bar.time === newest || (held !== undefined && sameBar(held, bar))) continue;
      this.put(bar);
      changed = true;
    }
    if (changed) this.reset();
  }

  private put(bar: Bar): void { this.bars.set(bar.time, bar); this.track(bar.time); }
  private track(time: number): void { if (this.newest === undefined || time > this.newest) this.newest = time; }

  private reset(): void {
    this.view.onReset([...this.bars.values()].sort((a, b) => a.time - b.time));
  }
}

const sameBar = (a: Bar, b: Bar): boolean =>
  a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close && a.volume === b.volume;
