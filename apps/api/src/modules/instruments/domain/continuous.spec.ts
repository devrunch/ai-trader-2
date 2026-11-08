import { describe, expect, it } from 'vitest';
import { InstrumentId, parseContinuous, resolveContinuous, type Instrument } from './index.js';

function contract(ticker: string, expiry: string, fields: Partial<Instrument> = {}): Instrument {
  return {
    id: InstrumentId.parse(`MCX:${ticker}`), exchange: 'MCX', ticker, expiry,
    description: ticker, type: 'futures', currency: 'INR', timezone: 'Asia/Kolkata',
    session: '0900-2330', pricescale: 100, minmov: 1, lotSize: 100,
    hasIntraday: true, volumeType: 'real', status: 'active', aliases: [], ...fields,
  };
}

describe('FR-SY-5, E23 continuous futures', () => {
  it('continuous resolves MCX commodity futures', () => {
    const near = contract('GOLDNOV', '2026-11-25', { type: 'commodity' });
    const far = contract('GOLDDEC', '2026-12-25', { type: 'commodity' });
    expect(resolveContinuous('GOLD', 1, [far, near], '2026-11-09')).toBe(near);
  });
  it('parses continuous ids', () => {
    expect(parseContinuous(InstrumentId.parse('MCX:GOLD1!'))).toEqual({ root: 'GOLD', rank: 1 });
    expect(parseContinuous(InstrumentId.parse('NSE:NIFTY2!'))).toEqual({ root: 'NIFTY', rank: 2 });
    for (const ticker of ['GOLD!', 'GOLD10!', 'GOLD0!', '1!']) {
      expect(parseContinuous(InstrumentId.parse(`MCX:${ticker}`))).toBeNull();
    }
  });

  it('continuous contract rolls to the next expiry after the last trading day', () => {
    const nov = contract('GOLDNOV', '2026-11-05');
    const dec = contract('DEC', '2026-12-05', { underlying: InstrumentId.parse('MCX:GOLD') });
    const contracts = [dec, contract('SILVER', '2026-11-01'), nov,
      contract('GOLDOPTION', '2026-11-01', { type: 'option' }),
      contract('GOLDOTHER', '2026-11-01', { underlying: InstrumentId.parse('MCX:SILVER') })];
    expect(resolveContinuous('GOLD', 1, contracts, '2026-11-05')).toBe(nov);
    expect(resolveContinuous('GOLD', 1, contracts, '2026-11-06')).toBe(dec);
    expect(resolveContinuous('GOLD', 2, contracts, '2026-11-05')).toBe(dec);
  });

  it('continuous returns null when no contract is unexpired', () => {
    expect(resolveContinuous('GOLD', 1, [contract('GOLDNOV', '2026-11-05')], '2026-11-06')).toBeNull();
    const undated = contract('GOLD', '2026-11-05');
    delete undated.expiry;
    expect(resolveContinuous('GOLD', 1, [undated], '2026-11-01')).toBeNull();
    expect(resolveContinuous('GOLD', 2, [], '2026-11-01')).toBeNull();
  });
});
