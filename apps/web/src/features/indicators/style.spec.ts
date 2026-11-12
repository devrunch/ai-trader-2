import { describe, expect, it } from 'vitest';
import type { IndicatorDefinition } from '@aitrader/contracts';
import { allowedPlotTypes, defaultPresentation, defaultVisibility, formatValue, resolveStyle, visibleOn } from './style';

const rsi: IndicatorDefinition = {
  ref: 'builtin:rsi@1', id: 'rsi', version: 1, name: 'RSI', shortName: 'RSI', overlay: false, inputs: [],
  plots: [{ id: 'rsi', title: 'RSI', kind: 'line', color: 'violet', lineWidth: 2 }],
  levels: [{ id: 'ob', title: 'Overbought', value: 70 }],
};

// FR-IN-10, FR-IN-11: defaults equal the built-in's definition.
describe('indicator style', () => {
  it('defaults equal the definition: plot colour, width, kind, levels and no precision override', () => {
    expect(defaultPresentation(rsi).style).toEqual({
      plots: { rsi: { visible: true, color: 'violet', lineWidth: 2, lineStyle: 'solid', type: 'line' } },
      levels: { ob: { visible: true, color: 'gray', value: 70, lineStyle: 'dashed' } }, precision: null, pane: 'parent',
    });
  });

  it('keeps a saved override and fills what was not saved from the defaults', () => {
    const saved = { ...defaultPresentation(rsi).style, plots: { other: { visible: false, color: 'red', lineWidth: 1, lineStyle: 'solid' as const, type: 'line' as const } } };
    expect(resolveStyle(rsi, saved).plots.rsi?.color).toBe('violet');
    expect(resolveStyle(rsi, { ...saved, precision: 4 }).precision).toBe(4);
  });

  it('limits the plot type to the plot\'s own series family', () => {
    expect(allowedPlotTypes('line')).toEqual(['line', 'step', 'circles']);
    expect(allowedPlotTypes('histogram')).toEqual(['histogram', 'columns']);
  });

  it('formats with the chosen precision, two decimals by default', () => {
    expect(formatValue(1.23456, null)).toBe('1.23');
    expect(formatValue(1.23456, 0)).toBe('1');
    expect(formatValue(1.23456, 4)).toBe('1.2346');
  });
});

describe('visibleOn', () => {
  it('hides on 5m when only hours are enabled and shows again on 1h', () => {
    const hoursOnly = { ...Object.fromEntries(Object.entries(defaultVisibility()).map(([g, r]) => [g, { ...r, enabled: g === 'hours' }])) } as ReturnType<typeof defaultVisibility>;
    expect(visibleOn(hoursOnly, '5')).toBe(false);
    expect(visibleOn(hoursOnly, '60')).toBe(true);
    expect(visibleOn(hoursOnly, '240')).toBe(true);
    expect(visibleOn(hoursOnly, '1D')).toBe(false);
  });

  it('applies the from-to range inside a group', () => {
    const visibility = { ...defaultVisibility(), minutes: { enabled: true, from: 5, to: 15 } };
    expect(['1', '3', '5', '15', '30'].map(i => visibleOn(visibility, i as '1'))).toEqual([false, false, true, true, false]);
  });

  it('shows everywhere by default', () => {
    expect(['1', '3', '5', '15', '30', '60', '240', '1D', '1W', '1M'].every(i => visibleOn(defaultVisibility(), i as '1'))).toBe(true);
  });
});
