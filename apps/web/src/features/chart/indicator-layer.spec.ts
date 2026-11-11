import { describe, expect, it, vi } from 'vitest';
import type { IndicatorDefinition, IndicatorResult } from '@aitrader/contracts';
import type { IndicatorSeriesLike, IndicatorSeriesOptions } from './chart-adapter';
import { IndicatorLayer } from './indicator-layer';

const definition = (id: string, overlay: boolean, plots: string[], levels: number[] = []): IndicatorDefinition => ({
  ref: `builtin:${id}@1`, id, version: 1, name: id, shortName: id.toUpperCase(), overlay, inputs: [],
  plots: plots.map(plot => ({ id: plot, title: plot, kind: plot === 'histogram' ? 'histogram' : 'line', color: 'blue', lineWidth: 1 })),
  levels: levels.map(value => ({ id: `l${String(value)}`, title: `L${String(value)}`, value })),
});
const result = (plots: Record<string, (number | null)[]>): IndicatorResult => ({
  instrumentId: 'NSE:A', resolvedId: 'NSE:A', interval: '1', ref: 'x', inputs: {}, times: [60_000, 120_000], status: { state: 'ok' },
  plots: Object.entries(plots).map(([id, values]) => ({ id, values })),
});

function fakeChart() {
  const created: { options: IndicatorSeriesOptions; series: IndicatorSeriesLike & { setData: ReturnType<typeof vi.fn>; priceLine: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } }[] = [];
  return { created, chart: { addIndicatorSeries: (options: IndicatorSeriesOptions) => {
    const series = { setData: vi.fn(), update: vi.fn(), priceLine: vi.fn(), remove: vi.fn() };
    created.push({ options, series });
    return series;
  } } };
}

// FR-CH-2, FR-IN-15/16: indicator plots on the price pane or their own pane, colours from theme tokens.
describe('IndicatorLayer', () => {
  it('paints overlays on the price pane and others on their own panes, with gaps where Pine has na', () => {
    const { chart, created } = fakeChart();
    const layer = new IndicatorLayer(chart, token => `css(${token})`);
    layer.set([
      { key: 'a', definition: definition('sma', true, ['ma']), result: result({ ma: [null, 5] }) },
      { key: 'b', definition: definition('rsi', false, ['rsi'], [70, 30]), result: result({ rsi: [40, 60] }) },
      { key: 'c', definition: definition('macd', false, ['histogram']), result: result({ histogram: [1, -1] }) },
    ]);
    expect(created.map(c => [c.options.pane, c.options.kind, c.options.color])).toEqual([[0, 'line', 'css(blue)'], [2, 'line', 'css(blue)'], [3, 'histogram', 'css(blue)']]);
    expect(created[0]?.series.setData).toHaveBeenCalledWith([{ time: 60 }, { time: 120, value: 5 }]);
    expect(created[1]?.series.priceLine).toHaveBeenCalledWith(70, 'L70', 'css(gray)');
  });

  // FR-IN-13: as TradingView does, a child of an indicator on its own pane draws on that pane.
  it('paints a child of a pane indicator on the parent\'s pane, wherever it sits in the list', () => {
    const { chart, created } = fakeChart();
    const layer = new IndicatorLayer(chart, token => token);
    layer.set([
      { key: 'child', parentKey: 'rsi', definition: definition('sma', true, ['ma']), result: result({ ma: [1, 2] }) },
      { key: 'rsi', definition: definition('rsi', false, ['rsi']), result: result({ rsi: [40, 60] }) },
      { key: 'other', definition: definition('macd', false, ['macd']), result: result({ macd: [1, 2] }) },
      { key: 'onPrice', parentKey: 'sma0', definition: definition('sma', true, ['ma']), result: result({ ma: [1, 2] }) },
      { key: 'sma0', definition: definition('sma', true, ['ma']), result: result({ ma: [1, 2] }) },
    ]);
    expect(created.map(c => c.options.pane)).toEqual([2, 2, 3, 0, 0]);
  });

  it('repaints only an indicator whose result changed', () => {
    const { chart, created } = fakeChart();
    const layer = new IndicatorLayer(chart, token => token);
    const a = { key: 'a', definition: definition('sma', true, ['ma']), result: result({ ma: [1, 2] }) };
    layer.set([a]);
    layer.set([a]);
    expect(created).toHaveLength(1);
    layer.set([{ ...a, result: result({ ma: [1, 3] }) }]);
    expect(created).toHaveLength(1);
    expect(created[0]?.series.setData).toHaveBeenLastCalledWith([{ time: 60, value: 1 }, { time: 120, value: 3 }]);
  });

  it('removes the series of removed indicators and renumbers panes', () => {
    const { chart, created } = fakeChart();
    const layer = new IndicatorLayer(chart, token => token);
    const rsi = { key: 'b', definition: definition('rsi', false, ['rsi']), result: result({ rsi: [1, 2] }) };
    layer.set([{ key: 'a', definition: definition('stoch', false, ['k']), result: result({ k: [1, 2] }) }, rsi]);
    layer.set([rsi]);
    expect(created[0]?.series.remove).toHaveBeenCalled();
    expect(created.at(-1)?.options.pane).toBe(2);
    layer.destroy();
    expect(created.at(-1)?.series.remove).toHaveBeenCalled();
  });
});

// B1: the chart joins the points either side of a null; the last value before a null is transparent so the bridge is invisible.
describe('IndicatorLayer gaps', () => {
  const times = [60_000, 120_000, 180_000, 240_000];
  const paint = (values: (number | null)[], kind: 'line' | 'histogram' = 'line') => {
    const at = times.slice(0, values.length);
    const { chart, created } = fakeChart();
    const layer = new IndicatorLayer(chart, token => token);
    const def = definition('supertrend', true, ['up']);
    const plots = def.plots.map(plot => ({ ...plot, kind }));
    layer.set([{ key: 'a', definition: { ...def, plots }, result: { ...result({ up: values }), times: at } }]);
    return { layer, created };
  };

  it('keeps one series and makes the last point before a null transparent', () => {
    const { created } = paint([1, 2, null, 4]);
    expect(created).toHaveLength(1);
    expect(created[0]?.series.setData).toHaveBeenCalledWith([
      { time: 60, value: 1 }, { time: 120, value: 2, color: 'transparent' }, { time: 180 }, { time: 240, value: 4 }]);
  });

  it('leaves histogram plots uncoloured', () => {
    const { created } = paint([1, null, 3, 4], 'histogram');
    expect(created[0]?.series.setData).toHaveBeenCalledWith([{ time: 60, value: 1 }, { time: 120 }, { time: 180, value: 3 }, { time: 240, value: 4 }]);
  });

  it('recolors the previous point when a live null arrives, and again when it turns into a value', () => {
    const { layer, created } = paint([1, 2]);
    const series = created[0]?.series;
    layer.update('a', { barTime: 180_000, values: { up: null } });
    expect(series?.setData).toHaveBeenLastCalledWith([{ time: 60, value: 1 }, { time: 120, value: 2, color: 'transparent' }, { time: 180 }]);
    layer.update('a', { barTime: 180_000, values: { up: 3 } });
    expect(series?.setData).toHaveBeenLastCalledWith([{ time: 60, value: 1 }, { time: 120, value: 2 }, { time: 180, value: 3 }]);
    expect(created).toHaveLength(1);
  });

  it('updates in place when no null moves', () => {
    const { layer, created } = paint([1, 2]);
    layer.update('a', { barTime: 180_000, values: { up: 3 } });
    layer.update('a', { barTime: 180_000, values: { up: 3.5 } });
    expect(created[0]?.series.setData).toHaveBeenCalledTimes(1);
    expect(created[0]?.series.update).toHaveBeenLastCalledWith({ time: 180, value: 3.5 });
  });

  it('a value after a null continues without touching the older points', () => {
    const { layer, created } = paint([1, 2, null]);
    layer.update('a', { barTime: 240_000, values: { up: 4 } });
    expect(created[0]?.series.setData).toHaveBeenCalledTimes(1);
    expect(created[0]?.series.update).toHaveBeenCalledWith({ time: 240, value: 4 });
  });
});
