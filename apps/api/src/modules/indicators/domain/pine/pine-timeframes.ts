import type { Bar, Interval } from '@aitrader/contracts';

const SECOND = 1000;
const MINUTE = 60_000;
const SPAN_MS: Record<Interval, number> = { '1S': SECOND, '5S': 5 * SECOND, '15S': 15 * SECOND, '30S': 30 * SECOND, '1': MINUTE, '3': 3 * MINUTE, '5': 5 * MINUTE, '15': 15 * MINUTE, '30': 30 * MINUTE, '60': 60 * MINUTE, '240': 240 * MINUTE,
  '1D': 24 * 60 * MINUTE, '1W': 7 * 24 * 60 * MINUTE, '1M': 31 * 24 * 60 * MINUTE };
const PINE_TO_INTERVAL: Record<string, Interval> = { '1': '1', '3': '3', '5': '5', '15': '15', '30': '30', '60': '60', '240': '240', D: '1D', '1D': '1D', W: '1W', '1W': '1W', M: '1M', '1M': '1M' };

/** Pine's name for a chart interval (`D`, `W`, `M` for the calendar ones). */
export function toPineTimeframe(interval: Interval): string {
  return interval === '1D' ? 'D' : interval === '1W' ? 'W' : interval === '1M' ? 'M' : interval;
}

/** The interval a `request.security` timeframe asks for, or `null` when the store has none (seconds: live-only for watched charts; ticks, odd minutes). */
export function fromPineTimeframe(timeframe: string): Interval | null {
  return PINE_TO_INTERVAL[timeframe] ?? null;
}

/** PineTS's candle; a bar closes one millisecond before the next opens, or at its nominal span inside a session. */
export function toCandles(bars: readonly Bar[], interval: Interval): { openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number }[] {
  return bars.map((bar, i) => {
    const next = bars[i + 1]?.time;
    const end = bar.time + SPAN_MS[interval];
    return { openTime: bar.time, closeTime: (next === undefined ? end : Math.min(end, next)) - 1, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume ?? 0 };
  });
}

/** NSE and BSE trade 09:15-15:30 on weekdays; Pine's session days run Sunday = 1. */
export function sessionFor(instrumentId: string): string {
  return /^(NSE|BSE):/.test(instrumentId) ? '0915-1530:23456' : '24x7';
}
