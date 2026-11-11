import { describe, expect, it } from 'vitest';
import type { IndicatorDefinition } from '@aitrader/contracts';
import { ancestorsOf, chainOthers, decodeRef, encodeRef, indicatorLabel, sourceOptions, sourceUnavailable } from './source-refs';
import type { ChartIndicator } from './state/indicator-store';

const def = (id: string, shortName: string, plots: [string, string][], numeric: string[] = ['length']): IndicatorDefinition => ({
  ref: `builtin:${id}@1`, id, version: 1, name: shortName, shortName, overlay: false, levels: [],
  inputs: [...numeric.map(n => ({ id: n, title: n, type: 'int' as const, default: 14 })), { id: 'source', title: 'Source', type: 'source' as const, default: 'close' as const }],
  plots: plots.map(([pid, title]) => ({ id: pid, title, kind: 'line' as const, color: 'blue' as const, lineWidth: 1 })),
});
const defs = [def('rsi', 'RSI', [['rsi', 'RSI']]), def('sma', 'SMA', [['ma', 'MA']]), def('macd', 'MACD', [['macd', 'MACD'], ['signal', 'Signal']], ['fast'])];
const rsi: ChartIndicator = { key: 'ind-1', id: 'rsi', inputs: {} };
const sma: ChartIndicator = { key: 'ind-2', id: 'sma', inputs: { length: 9, source: { from: 'ind-1', plot: 'rsi' } } };
const macd: ChartIndicator = { key: 'ind-3', id: 'macd', inputs: {} };

// FR-IN-13
describe('source references', () => {
  it('round-trips a ref through the dropdown value', () => {
    expect(decodeRef(encodeRef({ from: 'ind-1', plot: 'rsi' }))).toEqual({ from: 'ind-1', plot: 'rsi' });
    expect(decodeRef('hl2')).toBeUndefined();
  });

  it('labels an indicator by name and numeric inputs', () => {
    expect(indicatorLabel(defs[0], rsi)).toBe('RSI 14');
    expect(indicatorLabel(defs[1], sma)).toBe('SMA 9');
    expect(indicatorLabel(undefined, rsi)).toBe('rsi');
  });

  it('lists every other indicator\'s plots as "RSI 14: RSI", leaving out itself and anything that uses it', () => {
    expect(sourceOptions([rsi, sma, macd], sma, defs).map(o => o.label)).toEqual(['RSI 14: RSI', 'MACD 14: MACD', 'MACD 14: Signal']);
    expect(sourceOptions([rsi, sma, macd], rsi, defs).map(o => o.label)).toEqual(['MACD 14: MACD', 'MACD 14: Signal']);
    expect(sourceOptions([rsi, sma, macd], macd, defs)[0]).toEqual({ value: 'ref:ind-1:rsi', label: 'RSI 14: RSI' });
  });

  it('collects the ancestors the server needs, nearest first', () => {
    const top: ChartIndicator = { key: 'ind-4', id: 'sma', inputs: { source: { from: 'ind-2', plot: 'ma' } } };
    expect(ancestorsOf([rsi, sma, top], top).map(a => a.key)).toEqual(['ind-2', 'ind-1']);
    expect(chainOthers([rsi, sma, top], sma, defs)).toEqual([{ instanceId: 'ind-1', label: 'RSI 14', indicator: { kind: 'builtin', id: 'rsi', inputs: {} } }]);
  });

  it('stops at a cycle instead of looping', () => {
    const a: ChartIndicator = { key: 'a', id: 'sma', inputs: { source: { from: 'b', plot: 'ma' } } };
    const b: ChartIndicator = { key: 'b', id: 'sma', inputs: { source: { from: 'a', plot: 'ma' } } };
    expect(ancestorsOf([a, b], a).map(x => x.key)).toEqual(['b']);
  });

  it('flags a child whose parent was removed or failed, and clears when it is back (E28)', () => {
    expect(sourceUnavailable([sma], sma, new Set())).toBe(true);
    expect(sourceUnavailable([rsi, sma], sma, new Set())).toBe(false);
    expect(sourceUnavailable([rsi, sma], sma, new Set(['ind-1']))).toBe(true);
    expect(sourceUnavailable([rsi, sma, macd], macd, new Set())).toBe(false);
  });

  it('flags a grandchild when the grandparent is gone', () => {
    const top: ChartIndicator = { key: 'ind-4', id: 'sma', inputs: { source: { from: 'ind-2', plot: 'ma' } } };
    expect(sourceUnavailable([sma, top], top, new Set())).toBe(true);
  });
});
