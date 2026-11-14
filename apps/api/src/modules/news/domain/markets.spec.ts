import { describe, expect, it } from 'vitest';
import { marketsFor } from '@aitrader/contracts';

describe('marketsFor', () => {
  it('derives markets from instruments and asset classes', () => {
    expect(marketsFor(['NSE:INFY'], [], ['us'])).toEqual(['india']);
    expect(marketsFor(['FX:USDINR'], ['MCX:GOLD1!'], [])).toEqual(['forex', 'india', 'commodities']);
    expect(marketsFor(['CRYPTO:BTCUSD'], [], [])).toEqual(['crypto']);
  });
  it('falls back to the source markets when nothing is tagged', () => {
    expect(marketsFor([], [], ['india', 'forex'])).toEqual(['india', 'forex']);
    expect(marketsFor([], [], [])).toEqual([]);
  });
});
