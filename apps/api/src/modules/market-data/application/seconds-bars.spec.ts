import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecondsBars } from './seconds-bars';
import type { LiveFeed, Tick } from './ports/live-feed';
import type { SecondsStore } from './ports/seconds-store';
import type { SecondInterval } from '../domain/interval';

const T0 = Date.UTC(2026, 10, 11, 4, 0, 0);
let now = T0;
function setup(active: Array<{ instrumentId: string; interval: SecondInterval }>) {
  let listener: (t: Tick) => void = () => undefined;
  const feed = { onTick: (l: (t: Tick) => void) => { listener = l; return () => undefined; } } as unknown as LiveFeed;
  const put = vi.fn<SecondsStore['put']>().mockResolvedValue();
  const demand = { active: vi.fn(() => Promise.resolve(active)) };
  const bars = new SecondsBars({ put, read: vi.fn() }, demand, { clock: () => now, log: () => undefined });
  return { feed, put, bars, tick: (t: Partial<Tick> & { at: number }) => { now = t.at; listener({ instrumentId: 'NSE:A', price: 10, cumVolume: null, ...t }); } };
}

describe('FR-CH-8 SecondsBars', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it('builds bars only for instruments watched at a seconds interval', async () => {
    const { feed, put, bars, tick } = setup([{ instrumentId: 'NSE:A', interval: '1S' }]);
    bars.attach(feed); await bars.refresh();
    tick({ at: T0 }); tick({ at: T0 + 1000, price: 11 }); tick({ at: T0, instrumentId: 'NSE:B' });
    await vi.advanceTimersByTimeAsync(0);
    expect(put.mock.calls.map(c => [c[0], c[1], c[2], c[3].time])).toEqual([
      ['NSE:A', '1S', 'forming', T0], ['NSE:A', '1S', 'closed', T0], ['NSE:A', '1S', 'forming', T0 + 1000]]);
  });
  it('feeds every watched interval of the instrument and drops builders when demand ends', async () => {
    const active = [{ instrumentId: 'NSE:A', interval: '1S' as const }, { instrumentId: 'NSE:A', interval: '5S' as const }];
    const { feed, put, bars, tick } = setup(active);
    bars.attach(feed); await bars.refresh();
    tick({ at: T0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(put.mock.calls.map(c => c[1])).toEqual(['1S', '5S']);
    active.length = 0; await bars.refresh(); put.mockClear();
    tick({ at: T0 + 100 });
    await vi.advanceTimersByTimeAsync(0);
    expect(put).not.toHaveBeenCalled();
  });
});
