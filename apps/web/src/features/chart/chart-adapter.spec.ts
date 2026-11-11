import { describe, expect, it, vi } from 'vitest';
import type { Bar } from '@aitrader/contracts';
import { ChartAdapter, type ChartColors, type ChartLike } from './chart-adapter';

const t0 = Date.UTC(2026, 10, 9, 3, 45);
const bar = (minute: number, open: number, close: number, volume: number | null = 5): Bar => ({ time: t0 + minute * 60_000, open, high: Math.max(open, close), low: Math.min(open, close), close, volume });
const colors: ChartColors = { up: '#0a0', down: '#a00', text: '#111', grid: '#eee', background: '#fff' };

function fakeChart() {
  let rangeListener: ((from: number | null) => void) | undefined;
  const chart = {
    candles: { setData: vi.fn(), update: vi.fn() },
    volume: { setData: vi.fn(), update: vi.fn() },
    onCrosshair: () => () => undefined, onVisibleRange: vi.fn((cb: (from: number | null) => void) => { rangeListener = cb; return vi.fn(); }),
    applyColors: vi.fn(),
    addIndicatorSeries: vi.fn(() => ({ setData: vi.fn(), update: vi.fn(), applyStyle: vi.fn(), setLevels: vi.fn(), remove: vi.fn() })),
    remove: vi.fn(),
  } satisfies ChartLike;
  return { chart, scroll: (from: number | null) => { rangeListener?.(from); } };
}

describe('ChartAdapter (FR-CH-1, FR-CH-5)', () => {
  it('reset converts to chart seconds and keeps null volume empty', () => {
    const { chart } = fakeChart();
    new ChartAdapter(chart, colors).reset([bar(0, 10, 12), bar(1, 12, 11, null)]);
    expect(chart.candles.setData).toHaveBeenCalledWith([
      { time: t0 / 1000, open: 10, high: 12, low: 10, close: 12 },
      { time: t0 / 1000 + 60, open: 12, high: 12, low: 11, close: 11 },
    ]);
    expect(chart.volume.setData).toHaveBeenCalledWith([
      { time: t0 / 1000, value: 5, color: '#0a0' },
      { time: t0 / 1000 + 60 },
    ]);
  });

  it('update forwards the newest bar to both series', () => {
    const { chart } = fakeChart();
    new ChartAdapter(chart, colors).update(bar(2, 11, 9, 3));
    expect(chart.candles.update).toHaveBeenCalledWith({ time: t0 / 1000 + 120, open: 11, high: 11, low: 9, close: 9 });
    expect(chart.volume.update).toHaveBeenCalledWith({ time: t0 / 1000 + 120, value: 3, color: '#a00' });
  });

  it('asks for older bars once per oldest bar when scrolled near the left edge', () => {
    const { chart, scroll } = fakeChart();
    const adapter = new ChartAdapter(chart, colors);
    const older = vi.fn();
    adapter.onNeedOlder(older);
    adapter.reset([bar(0, 10, 11), bar(1, 11, 12)]);
    scroll(50);
    expect(older).not.toHaveBeenCalled();
    scroll(5); scroll(3);
    expect(older).toHaveBeenCalledTimes(1);
    expect(older).toHaveBeenCalledWith(t0);
    adapter.reset([bar(-1, 9, 10), bar(0, 10, 11), bar(1, 11, 12)]);
    scroll(2);
    expect(older).toHaveBeenCalledTimes(2);
    expect(older).toHaveBeenLastCalledWith(t0 - 60_000);
  });

  it('theme changes recolor the chart and the volume bars', () => {
    const { chart } = fakeChart();
    const adapter = new ChartAdapter(chart, colors);
    adapter.reset([bar(0, 10, 12)]);
    adapter.applyColors({ ...colors, up: '#00f' });
    expect(chart.applyColors).toHaveBeenLastCalledWith(expect.objectContaining({ up: '#00f' }));
    expect(chart.volume.setData).toHaveBeenLastCalledWith([{ time: t0 / 1000, value: 5, color: '#00f' }]);
  });

  it('destroy unsubscribes and removes the chart', () => {
    const { chart } = fakeChart();
    const adapter = new ChartAdapter(chart, colors);
    adapter.destroy();
    expect(chart.remove).toHaveBeenCalled();
  });
});
