import { describe, expect, it } from 'vitest';
import { SpecialTokenFilter } from './special-tokens';

const run = (deltas: string[]) => { const f = new SpecialTokenFilter(); return deltas.map(d => f.push(d)).join('') + f.flush(); };

describe('SpecialTokenFilter', () => {
  it('removes a leaked DeepSeek call marker, whole or split across chunks', () => {
    expect(run(['I will check.\n\n<｜DSML｜function_callsThe last price is 1,325.'])).toBe('I will check.\n\nThe last price is 1,325.');
    expect(run(['I will check. <', '｜DSML', '｜function_calls', 'The price'])).toBe('I will check. The price');
    // The leak seen live: the name split mid-word, the next chunk starting with its tail.
    expect(run(['portfolio:\n<｜DSML｜function_c', 'alls2. Risk per trade'])).toBe('portfolio:\n2. Risk per trade');
  });

  it('leaves ordinary text and a lone "<" alone', () => {
    expect(run(['RSI < 30 means ', 'oversold.'])).toBe('RSI < 30 means oversold.');
    expect(run(['ends with <'])).toBe('ends with <');
  });
});
