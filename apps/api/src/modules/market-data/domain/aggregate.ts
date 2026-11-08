import type { Bar } from './bar';
import type { MarketCalendar } from './calendar';
import type { Interval } from './interval';
import { bucketStart } from './grid';

export function aggregate(bars1m: readonly Bar[], interval: Interval, cal: MarketCalendar): Bar[] {
  const result: Bar[] = [];
  for (const bar of bars1m) {
    const time = bucketStart(bar.time, interval, cal);
    if (time === null) continue;
    const previous = result.at(-1);
    if (!previous || previous.time !== time) {
      result.push({ ...bar, time });
      continue;
    }
    previous.high = Math.max(previous.high, bar.high);
    previous.low = Math.min(previous.low, bar.low);
    previous.close = bar.close;
    if (bar.volume !== null) previous.volume = (previous.volume ?? 0) + bar.volume;
    if (bar.repaired) previous.repaired = true;
  }
  return result;
}
