import { describe, expect, it } from 'vitest';
import { IndicatorDefinitionSchema } from '@aitrader/contracts';
import { buildPineDefinition, idsFromTitles, type PineMeta } from './pine-definition';
import { classifyPineFailure, findUnsupported } from './pine-features';
import { PineScriptError, PineUnsupportedError } from './pine-errors';
import { fromPineTimeframe, sessionFor, toCandles, toPineTimeframe } from './pine-timeframes';

const meta: PineMeta = {
  title: 'My ind', shortTitle: '', overlay: true,
  inputs: [
    { type: 'int', title: 'Length', defval: 14, minval: 1, maxval: 200, step: 2, group: 'G', tooltip: 'tt' },
    { type: 'float', title: 'Mult', defval: 2 }, { type: 'bool', title: 'On', defval: true },
    { type: 'string', title: 'MA type', defval: 'SMA', options: ['SMA', 'EMA'] },
    { type: 'source', title: 'Source', defval: 'close' },
    { type: 'color', title: 'Colour', defval: '#fff' }, { type: 'string', title: 'Free text', defval: 'x' },
  ],
  plots: [{ key: 'Fast', title: 'Fast', style: undefined }, { key: 'H', title: 'Hist', style: 'style_histogram' }, { key: 'Fast2', title: 'Fast', style: 'style_stepline' }],
  levels: [{ title: 'Upper', value: 70 }],
};

describe('Pine definition (FR-IN-31)', () => {
  it('turns input.int/float/bool/string/source into the definition inputs the settings dialog reads', () => {
    const definition = buildPineDefinition(meta, '0123456789ab');
    expect(IndicatorDefinitionSchema.parse(definition)).toEqual(definition);
    expect(definition.ref).toBe('pine:0123456789ab@1');
    expect(definition.inputs.map(i => [i.id, i.type, i.default])).toEqual([['length', 'int', 14], ['mult', 'float', 2], ['on', 'bool', true], ['maType', 'string', 'SMA'], ['source', 'source', 'close']]);
    expect(definition.inputs[0]).toMatchObject({ min: 1, max: 200, step: 2, group: 'G', tooltip: 'tt' });
  });

  it('maps plot styles to plot kinds and gives repeated titles distinct ids', () => {
    const { plots, levels, overlay } = buildPineDefinition(meta, '0123456789ab');
    expect(plots.map(p => [p.id, p.kind])).toEqual([['fast', 'line'], ['hist', 'histogram'], ['fast2', 'step']]);
    expect(levels).toEqual([{ id: 'upper', title: 'Upper', value: 70 }]);
    expect(overlay).toBe(true);
  });

  it('builds ids that start with a letter and stay unique', () => {
    expect(idsFromTitles(['1st', 'MA type', 'ma Type', '---'], 'in')).toEqual(['in1st', 'maType', 'maType2', 'in']);
  });
});

describe('unsupported features (FR-IN-4)', () => {
  it.each([
    ['strategy("x")', 'strategy()', 1], ['//@version=5\nindicator("x")\nx = strategy.entry("l", strategy.long)', 'strategy.*', 3],
    ['//@version=5\nindicator("x")\nimport TradingView/ta/7 as t', 'import', 3], ['a=1\nx = request.financial("A","B","C")', 'request.financial', 2],
  ])('finds %j at its line', (source, feature, line) => {
    expect(findUnsupported(source)).toEqual({ feature, line });
  });

  it('ignores features named in comments', () => {
    expect(findUnsupported('//@version=5\nindicator("x") // not a strategy.entry\nplot(close)')).toBeNull();
  });

  it('names the function and its line when PineTS does not know it', () => {
    const error = classifyPineFailure('ta.bogus is not a function', '//@version=5\nindicator("x")\nx = ta.bogus(close, 3)\nplot(x)');
    expect(error).toBeInstanceOf(PineUnsupportedError);
    expect(error).toMatchObject({ feature: 'ta.bogus', line: 3 });
  });

  it('reads the line of a syntax error and says v4 is unsupported at the version line', () => {
    expect(classifyPineFailure('Failed to transpile Pine Script version 5: Unexpected token EOF \'\' at 4:1', 'x')).toMatchObject({ line: 4, message: expect.stringContaining('(line 4)') as string });
    expect(classifyPineFailure('Unsupported Pine Script version 4. Only version 5 and above are supported.', '//@version=4\nstudy("t")')).toMatchObject({ feature: 'Pine v4', line: 1 });
    expect(classifyPineFailure('boom', 'x')).toBeInstanceOf(PineScriptError);
  });
});

describe('Pine timeframes and candles', () => {
  it('maps chart intervals to Pine and back, and refuses what the store lacks', () => {
    expect([toPineTimeframe('1D'), toPineTimeframe('1W'), toPineTimeframe('1M'), toPineTimeframe('15')]).toEqual(['D', 'W', 'M', '15']);
    expect([fromPineTimeframe('D'), fromPineTimeframe('1D'), fromPineTimeframe('60'), fromPineTimeframe('120'), fromPineTimeframe('1S')]).toEqual(['1D', '1D', '60', null, null]);
  });

  it('closes a bar one millisecond before the next opens, or at its span inside a session', () => {
    const bars = [{ time: 0, open: 1, high: 2, low: 0, close: 1, volume: 5 }, { time: 15 * 60_000, open: 1, high: 2, low: 0, close: 1, volume: null }, { time: 86_400_000, open: 1, high: 2, low: 0, close: 1, volume: 1 }];
    expect(toCandles(bars, '15').map(c => [c.closeTime, c.volume])).toEqual([[899_999, 5], [1_799_999, 0], [86_400_000 + 899_999, 1]]);
  });

  it('gives NSE and BSE the Indian session and others 24x7', () => {
    expect([sessionFor('NSE:RELIANCE'), sessionFor('BSE:X'), sessionFor('BINANCE:BTC')]).toEqual(['0915-1530:23456', '0915-1530:23456', '24x7']);
  });
});
