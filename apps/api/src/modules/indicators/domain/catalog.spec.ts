import { describe, expect, it } from 'vitest';
import { IndicatorDefinitionSchema } from '@aitrader/contracts';
import { BUILTINS, findBuiltin, findBuiltinByRef } from './catalog';
import { resolveInputs } from './inputs';

describe('built-in catalog (FR-IN-7 wave 1, FR-IN-31)', () => {
  it('holds the first ten wave-1 built-ins, then the P4-13a batch', () => {
    expect(BUILTINS.map(b => b.definition.id)).toEqual(['sma', 'ema', 'wma', 'rsi', 'macd', 'bb', 'atr', 'stoch', 'vwap', 'supertrend',
      'dmi', 'adx', 'psar', 'ichimoku', 'donchian', 'kc', 'cci', 'mfi', 'obv', 'wpr', 'roc', 'mom', 'hma', 'vwma', 'dema', 'tema', 'aroon', 'cmf', 'pivots']);
    expect(BUILTINS.every(b => b.definition.ref === `builtin:${b.definition.id}@1`)).toBe(true);
  });

  it.each(BUILTINS.map(b => [b.definition.id, b] as const))('%s satisfies the contract and its defaults resolve', (_, builtin) => {
    expect(IndicatorDefinitionSchema.parse(builtin.definition)).toEqual(builtin.definition);
    expect(Object.keys(resolveInputs(builtin.definition.inputs, {}))).toEqual(builtin.definition.inputs.map(i => i.id));
    expect(new Set(builtin.definition.plots.map(p => p.id)).size).toBe(builtin.definition.plots.length);
  });

  it.each(BUILTINS.map(b => [b.definition.id, b] as const))('%s Pine source names every input and plot by its title', (_, builtin) => {
    for (const input of builtin.definition.inputs) expect(builtin.pine).toContain(`"${input.title}"`);
    for (const plot of builtin.definition.plots) expect(builtin.pine).toMatch(new RegExp(`plot\\(.*"${plot.title.replace(/[#%()+]/g, '\\$&')}"`));
  });

  it('gives Ichimoku the TradingView plot offsets (displacement − 1) and no other built-in one', () => {
    const ichimoku = findBuiltin('ichimoku');
    const inputs = resolveInputs(ichimoku.definition.inputs, {});
    expect(ichimoku.plotOffsets?.(inputs)).toEqual({ lagging: -25, leadA: 25, leadB: 25 });
    expect(ichimoku.plotOffsets?.(resolveInputs(ichimoku.definition.inputs, { displacement: 1 }))).toEqual({ lagging: 0, leadA: 0, leadB: 0 });
    expect(BUILTINS.filter(b => b.plotOffsets !== undefined).map(b => b.definition.id)).toEqual(['ichimoku']);
  });

  it("carries TradingView's defaults, plot titles and levels for the P4-13a batch", () => {
    const summary = (id: string) => {
      const { inputs, plots, levels } = findBuiltin(id).definition;
      return { inputs: inputs.map(i => `${i.title}=${String(i.default)}`), plots: plots.map(p => p.title), levels: levels.map(l => l.value) };
    };
    expect(summary('dmi')).toEqual({ inputs: ['ADX Smoothing=14', 'DI Length=14'], plots: ['ADX', '+DI', '-DI'], levels: [] });
    expect(summary('psar')).toEqual({ inputs: ['Start=0.02', 'Increment=0.02', 'Maximum=0.2'], plots: ['ParabolicSAR'], levels: [] });
    expect(summary('ichimoku')).toEqual({ inputs: ['Conversion Line Length=9', 'Base Line Length=26', 'Leading Span B Length=52', 'Lagging Span=26'],
      plots: ['Conversion Line', 'Base Line', 'Lagging Span', 'Leading Span A', 'Leading Span B'], levels: [] });
    expect(summary('donchian')).toEqual({ inputs: ['Length=20'], plots: ['Basis', 'Upper', 'Lower'], levels: [] });
    expect(summary('kc')).toEqual({ inputs: ['Length=20', 'Multiplier=2', 'Source=close', 'Use Exponential MA=true', 'Bands Style=Average True Range', 'ATR Length=10'],
      plots: ['Basis', 'Upper', 'Lower'], levels: [] });
    expect(summary('cci')).toEqual({ inputs: ['Length=20', 'Source=hlc3'], plots: ['CCI'], levels: [100, 0, -100] });
    expect(summary('mfi')).toEqual({ inputs: ['Length=14'], plots: ['MF'], levels: [80, 50, 20] });
    expect(summary('wpr')).toEqual({ inputs: ['Length=14'], plots: ['%R'], levels: [-20, -50, -80] });
    expect(summary('roc')).toEqual({ inputs: ['Length=9', 'Source=close'], plots: ['ROC'], levels: [0] });
    expect(summary('mom')).toEqual({ inputs: ['Length=10', 'Source=close'], plots: ['MOM'], levels: [] });
    expect(summary('aroon')).toEqual({ inputs: ['Length=14'], plots: ['Aroon Down', 'Aroon Up'], levels: [] });
    expect(summary('cmf')).toEqual({ inputs: ['Length=20'], plots: ['Chaikin Money Flow'], levels: [0] });
    expect(summary('vwma').inputs).toEqual(['Length=20', 'Source=close', 'Offset=0']);
    expect(summary('pivots').plots).toEqual(['R5', 'R4', 'R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3', 'S4', 'S5']);
  });

  it('finds built-ins by id, version and ref', () => {
    expect(findBuiltin('rsi').definition.shortName).toBe('RSI');
    expect(findBuiltin('rsi', 1).definition.ref).toBe('builtin:rsi@1');
    expect(findBuiltinByRef('builtin:macd@1').definition.id).toBe('macd');
  });

  it.each([['zigzag', undefined, 'builtin:zigzag'], ['rsi', 2, 'builtin:rsi@2']] as const)('rejects unknown %s@%s', (id, version, ref) => {
    expect(() => findBuiltin(id, version)).toThrow(expect.objectContaining({ code: 'NOT_FOUND', ref }));
  });

  it('rejects malformed refs', () => {
    expect(() => findBuiltinByRef('rsi')).toThrow(expect.objectContaining({ code: 'NOT_FOUND', ref: 'rsi' }));
  });

  it('reads enough warm-up for recursive state to converge', () => {
    const warmup = (id: string, raw: Record<string, unknown>, interval: '1' | '5' | '1D' = '5') => {
      const builtin = findBuiltin(id);
      return builtin.warmup(resolveInputs(builtin.definition.inputs, raw), interval);
    };
    expect(warmup('sma', { length: 50 })).toBe(50);
    expect(warmup('ema', { length: 20 })).toBe(500);
    expect(warmup('ema', { length: 200 })).toBe(2000);
    expect(warmup('rsi', {})).toBe(500);
    expect(warmup('macd', {})).toBe(500);
    expect(warmup('macd', { oscillatorMaType: 'SMA', signalMaType: 'SMA' })).toBe(35);
    expect(warmup('bb', {})).toBe(20);
    expect(warmup('bb', { maType: 'EMA' })).toBe(500);
    expect(warmup('atr', { smoothing: 'SMA' })).toBe(15);
    expect(warmup('atr', {})).toBe(500);
    expect(warmup('stoch', {})).toBe(18);
    expect(warmup('supertrend', {})).toBe(500);
    expect(warmup('vwap', {}, '1')).toBe(1440);
    expect(warmup('vwap', { anchor: 'Week' }, '1D')).toBe(7);
    expect(warmup('vwap', {}, '1D')).toBe(1);
    expect(warmup('dmi', {})).toBe(500);
    expect(warmup('psar', {})).toBe(500);
    expect(warmup('ichimoku', {})).toBe(52);
    expect(warmup('donchian', { length: 30 })).toBe(30);
    expect(warmup('kc', {})).toBe(500);
    expect(warmup('cci', {})).toBe(20);
    expect(warmup('mfi', {})).toBe(15);
    expect(warmup('roc', {})).toBe(10);
    expect(warmup('hma', { length: 16 })).toBe(20);
    expect(warmup('dema', { length: 20 })).toBe(500);
    expect(warmup('tema', { length: 100 })).toBe(3000);
    expect(warmup('aroon', {})).toBe(15);
    expect(warmup('pivots', {}, '5')).toBe(576);
    expect(warmup('pivots', {}, '1D')).toBe(2);
  });
});
