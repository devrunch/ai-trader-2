import { describe, expect, it } from 'vitest';
import type { IndicatorInputDef } from '@aitrader/contracts';
import { boolInput, numberInput, resolveInputs, sourceInput, stringInput } from './inputs';

const defs: IndicatorInputDef[] = [
  { id: 'length', title: 'Length', type: 'int', default: 14, min: 1, max: 5000 },
  { id: 'mult', title: 'StdDev', type: 'float', default: 2, min: 0.001, max: 50 },
  { id: 'show', title: 'Show', type: 'bool', default: true },
  { id: 'maType', title: 'MA Type', type: 'string', default: 'SMA', options: ['SMA', 'EMA'] },
  { id: 'source', title: 'Source', type: 'source', default: 'close' },
];

// FR-IN-9: every input type is resolved against its definition.
describe('resolveInputs', () => {
  it('fills defaults for missing inputs', () => {
    expect(resolveInputs(defs, {})).toEqual({ length: 14, mult: 2, show: true, maType: 'SMA', source: 'close' });
  });

  it('keeps valid overrides', () => {
    expect(resolveInputs(defs, { length: 21, mult: 2.5, show: false, maType: 'EMA', source: 'hl2' }))
      .toEqual({ length: 21, mult: 2.5, show: false, maType: 'EMA', source: 'hl2' });
  });

  it.each([
    [{ length: 1.5 }, 'length', 'must be an integer'],
    [{ length: 0 }, 'length', 'must be at least 1'],
    [{ length: 5001 }, 'length', 'must be at most 5000'],
    [{ length: '14' }, 'length', 'must be a number'],
    [{ mult: Number.NaN }, 'mult', 'must be a number'],
    [{ show: 1 }, 'show', 'must be true or false'],
    [{ maType: 'HMA' }, 'maType', 'must be one of SMA, EMA'],
    [{ source: 'vwap' }, 'source', 'must be one of open, high, low, close, hl2, hlc3, ohlc4, hlcc4'],
    [{ colour: 'red' }, 'colour', 'is not an input of this indicator'],
  ])('rejects %j naming the input', (raw, input, reason) => {
    expect(() => resolveInputs(defs, raw)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', input, message: `Input "${input}": ${reason}` }));
  });

  it('reads resolved values by type', () => {
    const inputs = resolveInputs(defs, {});
    expect(numberInput(inputs, 'length')).toBe(14);
    expect(boolInput(inputs, 'show')).toBe(true);
    expect(stringInput(inputs, 'maType')).toBe('SMA');
    expect(sourceInput(inputs, 'source')).toBe('close');
    expect(() => numberInput(inputs, 'maType')).toThrow('Input "maType": must be a number');
    expect(() => boolInput(inputs, 'length')).toThrow('Input "length": must be true or false');
    expect(() => stringInput(inputs, 'length')).toThrow('Input "length": must be a string');
    expect(() => sourceInput(inputs, 'maType')).toThrow('Input "maType": must be a price source');
  });
});
