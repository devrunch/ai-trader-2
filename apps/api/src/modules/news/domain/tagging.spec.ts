import { describe, expect, it } from 'vitest';
import { tagger } from './tagging';

describe('news tagging', () => {
  const tag = tagger();
  it('finds indices, companies and commodities as whole words', () => {
    expect(tag('Nifty ends higher as Reliance and HDFC Bank gain; gold slips')).toEqual(['NSE:NIFTY', 'MCX:GOLD1!', 'NSE:RELIANCE', 'NSE:HDFCBANK']);
    expect(tag('Bank Nifty hits record')).toEqual(['NSE:NIFTY', 'NSE:BANKNIFTY']);
    expect(tag('L&T bags order worth Rs 5,000 crore')).toEqual(['NSE:LT']);
  });
  it('does not match inside other words', () => {
    expect(tag('Goldman Sachs raises target; silverware maker lists; reliant on exports')).toEqual([]);
    expect(tag('Itchy markets')).toEqual([]);
  });
});
