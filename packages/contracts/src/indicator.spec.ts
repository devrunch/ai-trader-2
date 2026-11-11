import { describe, expect, it } from 'vitest';
import {
  IndicatorComputeRequestSchema, IndicatorDefinitionSchema, IndicatorRefSchema, IndicatorResultSchema, IndicatorUpdateSchema, isSourceRef,
} from './indicator.js';

const rsi = {
  ref: 'builtin:rsi@1', id: 'rsi', version: 1, name: 'Relative Strength Index', shortName: 'RSI', overlay: false,
  inputs: [
    { id: 'length', title: 'Length', type: 'int', default: 14, min: 1, max: 5000, step: 1 },
    { id: 'source', title: 'Source', type: 'source', default: 'close' },
    { id: 'maType', title: 'MA type', type: 'string', default: 'SMA', options: ['SMA', 'EMA'] },
    { id: 'show', title: 'Show', type: 'bool', default: true },
    { id: 'mult', title: 'Mult', type: 'float', default: 2, min: 0.001, step: 0.1 },
  ],
  plots: [{ id: 'rsi', title: 'RSI', kind: 'line', color: 'violet', lineWidth: 1 }],
  levels: [{ id: 'upper', title: 'Upper Band', value: 70 }],
};

describe('indicator contracts (FR-IN-31, FR-IN-9)', () => {
  it('accepts a definition with every wave-1 input type', () => {
    expect(IndicatorDefinitionSchema.parse(rsi)).toEqual(rsi);
  });

  it('rejects a string input whose default is not one of its options', () => {
    const bad = { ...rsi, inputs: [{ id: 'maType', title: 'MA', type: 'string', default: 'HMA', options: ['SMA'] }] };
    expect(IndicatorDefinitionSchema.safeParse(bad).success).toBe(false);
  });

  it('parses builtin refs and rejects malformed ones', () => {
    expect(IndicatorRefSchema.parse('builtin:rsi@1')).toBe('builtin:rsi@1');
    for (const ref of ['rsi', 'builtin:rsi', 'builtin:RSI@1', 'builtin:rsi@0', 'script:x@1x']) expect(IndicatorRefSchema.safeParse(ref).success).toBe(false);
  });

  it('defaults compute inputs and range, and keeps builtin and pine on one request shape', () => {
    const builtin = IndicatorComputeRequestSchema.parse({ symbol: 'NSE:RELIANCE', interval: '5', indicator: { kind: 'builtin', id: 'rsi' } });
    expect(builtin).toEqual({ symbol: 'NSE:RELIANCE', interval: '5', indicator: { kind: 'builtin', id: 'rsi', inputs: {} }, range: { limit: 500 } });
    const pine = IndicatorComputeRequestSchema.parse({ symbol: 'NSE:RELIANCE', interval: '1D', indicator: { kind: 'pine', source: '//@version=6\nindicator("x")\nplot(close)' }, range: { limit: 10, before: 5 } });
    expect(pine.indicator).toEqual({ kind: 'pine', source: '//@version=6\nindicator("x")\nplot(close)', inputs: {} });
    expect(IndicatorComputeRequestSchema.safeParse({ symbol: 'NSE:X', interval: '5', indicator: { kind: 'builtin', id: 'rsi' }, range: { limit: 5001 } }).success).toBe(false);
    expect(IndicatorComputeRequestSchema.safeParse({ symbol: 'NSE:X', interval: '5', indicator: { kind: 'builtin', id: 'rsi', inputs: { length: [1] } } }).success).toBe(false);
  });

  it('requires one value per bar time for each plot', () => {
    const result = { instrumentId: 'NSE:X', resolvedId: 'NSE:X', interval: '5', ref: 'builtin:rsi@1', inputs: { length: 14 },
      times: [1, 2], plots: [{ id: 'rsi', values: [null, 50] }], status: { state: 'ok' } };
    expect(IndicatorResultSchema.safeParse(result).success).toBe(true);
    expect(IndicatorResultSchema.safeParse({ ...result, plots: [{ id: 'rsi', values: [50] }] }).success).toBe(false);
  });

  it('validates live updates strictly', () => {
    const update = { instanceId: 'i1', barTime: 60_000, values: { rsi: 51.2, signal: null }, seq: 3 };
    expect(IndicatorUpdateSchema.parse(update)).toEqual(update);
    expect(IndicatorUpdateSchema.safeParse({ ...update, runtime: 'native' }).success).toBe(false);
  });
});

// FR-IN-13: a source is a price source (a string, as saved today) or a reference to another indicator's plot.
describe('indicator source references', () => {
  const request = (inputs: unknown) => ({ symbol: 'NSE:INFY', interval: '1D', indicator: { kind: 'builtin', id: 'sma', inputs } });

  it('keeps saved price-source inputs valid', () => {
    expect(IndicatorComputeRequestSchema.safeParse(request({ length: 9, source: 'hl2' })).success).toBe(true);
  });

  it('parses a source that points at another indicator\'s plot', () => {
    const parsed = IndicatorComputeRequestSchema.parse({ ...request({ source: { from: 'ind-1', plot: 'rsi' } }), instanceId: 'ind-2', others: [
      { instanceId: 'ind-1', label: 'RSI 14', indicator: { kind: 'builtin', id: 'rsi', inputs: {} } }] });
    expect(parsed.indicator).toMatchObject({ inputs: { source: { from: 'ind-1', plot: 'rsi' } } });
    expect(parsed.others).toHaveLength(1);
  });

  it('rejects a malformed reference', () => {
    expect(IndicatorComputeRequestSchema.safeParse(request({ source: { from: 'ind-1' } })).success).toBe(false);
    expect(IndicatorComputeRequestSchema.safeParse(request({ source: { from: 'ind-1', plot: 'rsi', extra: 1 } })).success).toBe(false);
  });

  it('tells a reference from other values', () => {
    expect(isSourceRef({ from: 'a', plot: 'ma' })).toBe(true);
    expect(isSourceRef('close')).toBe(false);
  });
});
