import { describe, expect, it, vi } from 'vitest';
import type { IndicatorDefinition, IndicatorResult } from '@aitrader/contracts';
import type { IndicatorSeriesLike, IndicatorSeriesOptions } from './chart-adapter';
import { defaultStyle } from '../indicators';
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
  const created: { options: IndicatorSeriesOptions; series: IndicatorSeriesLike & { setData: ReturnType<typeof vi.fn>; applyStyle: ReturnType<typeof vi.fn>; setLevels: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } }[] = [];
  return { created, chart: { addIndicatorSeries: (options: IndicatorSeriesOptions) => {
    const series = { setData: vi.fn(), update: vi.fn(), applyStyle: vi.fn(), setLevels: vi.fn(), remove: vi.fn() };
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
    expect(created[1]?.series.setLevels).toHaveBeenCalledWith([{ value: 70, title: 'L70', color: 'css(gray)', lineStyle: 'dashed' }, { value: 30, title: 'L30', color: 'css(gray)', lineStyle: 'dashed' }]);
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

  // FR-IN-10: a style change repaints in place, never recreates the series or touches the data.
  it('restyles existing series in place: colour token, custom colour, width, line style, precision, visibility', () => {
    const { chart, created } = fakeChart();
    const layer = new IndicatorLayer(chart, token => `css(${token})`);
    const def = definition('rsi', false, ['rsi'], [70]);
    const base = { key: 'a', definition: def, result: result({ rsi: [1, 2] }) };
    layer.set([base]);
    const series = created[0]?.series;
    series?.setData.mockClear();
    const style = { ...defaultStyle(def), precision: 4 };
    style.plots.rsi = { visible: false, color: 'red', lineWidth: 3, lineStyle: 'dotted', type: 'step' };
    style.levels.l70 = { visible: true, color: '#112233', value: 80, lineStyle: 'solid' };
    layer.set([{ ...base, style }]);
    expect(created).toHaveLength(1);
    expect(series?.setData).not.toHaveBeenCalled();
    expect(series?.applyStyle).toHaveBeenLastCalledWith({ visible: false, color: 'css(red)', lineWidth: 3, lineStyle: 'dotted', type: 'step', precision: 4 });
    expect(series?.setLevels).toHaveBeenLastCalledWith([{ value: 80, title: 'L70', color: '#112233', lineStyle: 'solid' }]);
    layer.set([{ ...base, style: { ...style, plots: { rsi: { ...style.plots.rsi, color: '#abcdef' } } } }]);
    expect(series?.applyStyle).toHaveBeenLastCalledWith(expect.objectContaining({ color: '#abcdef' }));
  });

  it('leaves a series alone when its style did not change', () => {
    const { chart, created } = fakeChart();
    const layer = new IndicatorLayer(chart, token => token);
    const def = definition('rsi', false, ['rsi']);
    const base = { key: 'a', definition: def, result: result({ rsi: [1, 2] }) };
    layer.set([{ ...base, style: defaultStyle(def) }]);
    created[0]?.series.applyStyle.mockClear();
    layer.set([{ ...base, style: defaultStyle(def) }]);
    expect(created[0]?.series.applyStyle).not.toHaveBeenCalled();
  });

  // FR-IN-11: hidden on this interval hides plots and level lines without dropping the series.
  it('hides every plot and level of an indicator hidden on this interval, and shows them again', () => {
    const { chart, created } = fakeChart();
    const layer = new IndicatorLayer(chart, token => token);
    const base = { key: 'a', definition: definition('rsi', false, ['rsi'], [70]), result: result({ rsi: [1, 2] }) };
    layer.set([base]);
    layer.set([{ ...base, hidden: true }]);
    expect(created).toHaveLength(1);
    expect(created[0]?.series.applyStyle).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
    expect(created[0]?.series.setLevels).toHaveBeenLastCalledWith([]);
    layer.set([base]);
    expect(created[0]?.series.applyStyle).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }));
    expect(created[0]?.series.setLevels).toHaveBeenLastCalledWith([expect.objectContaining({ value: 70 })]);
  });

  // FR-IN-10: "Pane: parent / own pane / price pane" for a chained child.
  it('puts a chained child on its own pane or the price pane when asked, and back on the parent\'s pane by default', () => {
    const { chart, created } = fakeChart();
    const layer = new IndicatorLayer(chart, token => token);
    const rsi = { key: 'rsi', definition: definition('rsi', false, ['rsi']), result: result({ rsi: [1, 2] }) };
    const child = { key: 'c', parentKey: 'rsi', definition: definition('sma', true, ['ma']), result: result({ ma: [1, 2] }) };
    const withPane = (pane: 'parent' | 'own' | 'price') => ({ ...child, style: { ...defaultStyle(child.definition), pane } });
    layer.set([rsi, child]);
    expect(created.slice(-2).map(c => c.options.pane)).toEqual([2, 2]);
    layer.set([rsi, withPane('own')]);
    expect(created.slice(-2).map(c => c.options.pane)).toEqual([2, 3]);
    layer.set([rsi, withPane('price')]);
    expect(created.slice(-2).map(c => c.options.pane)).toEqual([2, 0]);
    layer.set([rsi, withPane('parent')]);
    expect(created.slice(-2).map(c => c.options.pane)).toEqual([2, 2]);
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
