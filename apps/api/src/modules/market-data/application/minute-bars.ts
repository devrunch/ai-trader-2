import { minuteStart, MINUTE_MS, percentChange } from '../domain/minute-change';
import type { StoredBarsReader } from './ports/stored-bars-reader';

export interface MinuteBar { time: number; open: number; high: number; low: number; close: number }

/** Look-back so a reference minute before a weekend or holiday still finds its last close. */
const LOOKBACK_MS = 4 * 86_400_000;

/** Stored 1-minute bars for many instruments in one query; never calls a vendor. */
export class MinuteBars {
  constructor(private readonly reader: StoredBarsReader) {}

  /** Bars with open time in [from, to), oldest first, by instrument. */
  async window(symbols: string[], from: number, to: number): Promise<Map<string, MinuteBar[]>> {
    const rows = await this.reader.range1m([...new Set(symbols)], from, to);
    const out = new Map<string, MinuteBar[]>();
    for (const [id, bars] of rows) out.set(id, bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    return out;
  }

  /** Percent change from the close of the minute `minutes` ago (or the last bar before it) to the newest stored minute; null without bars. */
  async changePct(symbols: string[], minutes: number, now: number): Promise<Map<string, number | null>> {
    const ref = minuteStart(now) - minutes * MINUTE_MS;
    const rows = await this.window(symbols, ref - LOOKBACK_MS, minuteStart(now) + MINUTE_MS);
    const out = new Map<string, number | null>();
    for (const id of new Set(symbols)) {
      const bars = rows.get(id) ?? [];
      const latest = bars.at(-1);
      const base = bars.findLast(b => b.time <= ref);
      out.set(id, latest && base && latest.time > base.time ? percentChange(base.close, latest.close) : null);
    }
    return out;
  }
}
