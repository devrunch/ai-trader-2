import { describe, expect, it } from 'vitest';
import { IndicatorDefinitionSchema } from '@aitrader/contracts';
import { BUILTINS, findBuiltin, findBuiltinByRef } from './catalog';
import { resolveInputs } from './inputs';

describe('built-in catalog (FR-IN-7 wave 1, FR-IN-31)', () => {
  it('holds the ten wave-1 built-ins', () => {
    expect(BUILTINS.map(b => b.definition.ref)).toEqual(['builtin:sma@1', 'builtin:ema@1', 'builtin:wma@1', 'builtin:rsi@1', 'builtin:macd@1',
      'builtin:bb@1', 'builtin:atr@1', 'builtin:stoch@1', 'builtin:vwap@1', 'builtin:supertrend@1']);
  });

  it.each(BUILTINS.map(b => [b.definition.id, b] as const))('%s satisfies the contract and its defaults resolve', (_, builtin) => {
    expect(IndicatorDefinitionSchema.parse(builtin.definition)).toEqual(builtin.definition);
    expect(Object.keys(resolveInputs(builtin.definition.inputs, {}))).toEqual(builtin.definition.inputs.map(i => i.id));
    expect(new Set(builtin.definition.plots.map(p => p.id)).size).toBe(builtin.definition.plots.length);
  });

  it.each(BUILTINS.map(b => [b.definition.id, b] as const))('%s Pine source names every input and plot by its title', (_, builtin) => {
    for (const input of builtin.definition.inputs) expect(builtin.pine).toContain(`"${input.title}"`);
    for (const plot of builtin.definition.plots) expect(builtin.pine).toMatch(new RegExp(`plot\\(.*"${plot.title.replace(/[#%()]/g, '\\$&')}"`));
  });

  it('finds built-ins by id, version and ref', () => {
    expect(findBuiltin('rsi').definition.shortName).toBe('RSI');
    expect(findBuiltin('rsi', 1).definition.ref).toBe('builtin:rsi@1');
    expect(findBuiltinByRef('builtin:macd@1').definition.id).toBe('macd');
  });

  it.each([['hma', undefined, 'builtin:hma'], ['rsi', 2, 'builtin:rsi@2']] as const)('rejects unknown %s@%s', (id, version, ref) => {
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
  });
});
