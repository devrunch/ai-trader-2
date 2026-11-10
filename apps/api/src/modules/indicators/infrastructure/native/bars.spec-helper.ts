import type { Bar } from '@aitrader/contracts';

const QUARTER_HOUR = 15 * 60_000;
/** 2024-12-31 12:00 UTC: 900 bars of 15 minutes cross a day, month, quarter and year boundary, and a Monday. */
const FIXTURE_START = Date.UTC(2024, 11, 31, 12);

/** Seeded random walk (the benchmark's generator), with one zero-volume bar. */
export function fixtureBars(count = 900, seed = 42, step = QUARTER_HOUR): Bar[] {
  let state = seed >>> 0;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const bars: Bar[] = [];
  let price = 1000;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = Math.max(1, open + (random() - 0.5) * 4);
    const high = Math.max(open, close) + random() * 2;
    const low = Math.min(open, close) - random() * 2;
    const volume = i === 37 ? 0 : Math.round(1000 + random() * 9000);
    bars.push({ time: FIXTURE_START + i * step, open, high, low, close, volume });
    price = close;
  }
  return bars;
}
