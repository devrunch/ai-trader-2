import { describe, expect, it, vi } from 'vitest';
import type { Drawing } from '@aitrader/contracts';
import type { IndicatorSeriesOptions } from './chart-adapter';
import { DrawingLayer } from './drawing-layer';
import { useDrawingStore } from './drawing-store';

const drawing = (segments: Drawing['segments']): Drawing => ({ symbol: 'NSE:INFY', interval: '5', segments, note: null, barsUsed: 300, lastBarTime: 120_000, status: { state: 'ok' } });

function fakeChart() {
  const created: { options: IndicatorSeriesOptions; setData: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }[] = [];
  return { created, chart: { addIndicatorSeries: (options: IndicatorSeriesOptions) => {
    const entry = { options, setData: vi.fn(), remove: vi.fn() };
    created.push(entry);
    return { setData: entry.setData, update: vi.fn(), priceLine: vi.fn(), remove: entry.remove };
  } } };
}

describe('DrawingLayer (FR-AG-6)', () => {
  it('draws each segment on the price pane at the server-computed prices, labelled', () => {
    const { chart, created } = fakeChart();
    new DrawingLayer(chart, token => `css(${token})`).set([drawing([
      { from: { time: 60_000, price: 100 }, to: { time: 120_000, price: 100 }, label: 'Support 100.00 · 3 touches' },
      { from: { time: 60_000, price: 90 }, to: { time: 120_000, price: 95 }, label: 'Support trend 90.00 → 95.00' },
    ])]);
    expect(created.map(c => [c.options.pane, c.options.title])).toEqual([[0, 'Support 100.00 · 3 touches'], [0, 'Support trend 90.00 → 95.00']]);
    expect(created[1]?.setData).toHaveBeenCalledWith([{ time: 60, value: 90 }, { time: 120, value: 95 }]);
  });

  it('replaces what it drew when the set changes', () => {
    const { chart, created } = fakeChart();
    const layer = new DrawingLayer(chart, () => 'c');
    layer.set([drawing([{ from: { time: 60_000, price: 1 }, to: { time: 120_000, price: 1 }, label: 'a' }])]);
    layer.set([]);
    expect(created[0]?.remove).toHaveBeenCalled();
  });
});

describe('drawing store', () => {
  it('applying the same card twice keeps one drawing; clear is per symbol and interval', () => {
    const d = drawing([]);
    useDrawingStore.getState().add('c1', d);
    useDrawingStore.getState().add('c1', d);
    useDrawingStore.getState().add('c2', { ...d, symbol: 'NSE:TCS' });
    expect(useDrawingStore.getState().items.map(i => i.id)).toEqual(['c1', 'c2']);
    useDrawingStore.getState().clear('NSE:INFY', '5');
    expect(useDrawingStore.getState().items.map(i => i.id)).toEqual(['c2']);
  });
});
