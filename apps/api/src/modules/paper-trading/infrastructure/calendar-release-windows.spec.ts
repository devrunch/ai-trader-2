import { describe, expect, it, vi } from 'vitest';
import type { EconomicEvent } from '@aitrader/contracts';
import { CalendarReleaseWindows } from './calendar-release-windows';

const T = Date.parse('2026-11-14T08:30:00Z');
const event = (country: string, at: number) => ({ country, at: new Date(at).toISOString() }) as EconomicEvent;
const instruments: Record<string, { currency: string; type: string }> = { 'NSE:INFY': { currency: 'INR', type: 'stock' }, 'FX:EURUSD': { currency: 'USD', type: 'forex' } };

function windows(now = { t: T }) {
  const list = vi.fn().mockResolvedValue([event('INR', T), event('USD', T + 3_600_000), event('EUR', T + 7_200_000)]);
  const market = { instrument: (id: string) => Promise.resolve({ id, exchange: id.split(':')[0] ?? '', status: 'active', lotSize: 1, tick: 0.05, ...instruments[id] } as never) };
  return { list, windows: new CalendarReleaseWindows({ list }, market, () => now.t), now };
}

describe('CalendarReleaseWindows', () => {
  it('returns the releases of the instrument currency inside the range', async () => {
    const { windows: w, list } = windows();
    expect(await w.near('NSE:INFY', T - 60_000, T + 60_000)).toEqual([T]);
    expect(await w.near('NSE:INFY', T + 60_000, T + 9_000_000)).toEqual([]);
    expect(list).toHaveBeenCalledWith({ days: 1, impact: 'High' });
  });
  it('counts both legs of a currency pair', async () => {
    expect(await windows().windows.near('FX:EURUSD', T, T + 9_000_000)).toEqual([T + 3_600_000, T + 7_200_000]);
  });
  it('reads the calendar at most once a minute', async () => {
    const { windows: w, list, now } = windows();
    await w.near('NSE:INFY', T, T); await w.near('NSE:INFY', T, T);
    expect(list).toHaveBeenCalledTimes(1);
    now.t += 61_000;
    await w.near('NSE:INFY', T, T);
    expect(list).toHaveBeenCalledTimes(2);
  });
});
