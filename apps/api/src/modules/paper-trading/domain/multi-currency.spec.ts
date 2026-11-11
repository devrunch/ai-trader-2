import { describe, expect, it } from 'vitest';
import { chargesFor } from './cost-model';
import { accountTermsFor } from './currency';
import { DEFAULT_RISK_LIMITS } from './risk';
import { marginRate } from './margin';
import { productAllowed, segmentOf } from './segment';

const active = (exchange: string, type: string, currency: string) => ({ exchange, type, currency, status: 'active' });

describe('paper trading beyond Indian cash and F&O (owner decision 2026-11-11)', () => {
  it('trades MCX commodities, US stocks and ETFs, forex and metals; never indices', () => {
    expect(segmentOf(active('MCX', 'commodity', 'INR'))).toBe('commodity');
    expect(segmentOf(active('MCX', 'option', 'INR'))).toBe('options');
    expect(segmentOf(active('NASDAQ', 'stock', 'USD'))).toBe('us-equity');
    expect(segmentOf(active('NYSEARCA', 'etf', 'USD'))).toBe('us-equity');
    expect(segmentOf(active('FX', 'forex', 'JPY'))).toBe('forex');
    expect(segmentOf(active('OANDA', 'metal', 'USD'))).toBe('forex');
    expect(segmentOf(active('NSE', 'index', 'INR'))).toBeNull();
    expect(segmentOf(active('MCX', 'index', 'INR'))).toBeNull();
    expect(segmentOf({ ...active('NASDAQ', 'stock', 'USD'), status: 'delisted' })).toBeNull();
  });

  it('allows delivery for stocks only, positional for the rest, intraday everywhere', () => {
    expect(productAllowed('us-equity', 'CNC')).toBe(true);
    expect(productAllowed('us-equity', 'NRML')).toBe(false);
    expect(productAllowed('forex', 'NRML')).toBe(true);
    expect(productAllowed('forex', 'CNC')).toBe(false);
    expect(productAllowed('commodity', 'MIS')).toBe(true);
  });

  it('blocks margin by segment', () => {
    expect(marginRate('us-equity', 'MIS')).toBe(0.25);
    expect(marginRate('forex', 'NRML')).toBe(0.05);
    expect(marginRate('commodity', 'NRML')).toBe(0.15);
  });

  it('charges MCX at Zerodha rates, US sells the SEC and FINRA fees, and forex nothing', () => {
    // A gold mini future: ₹14,05,730 notional. Brokerage capped at ₹20; CTT 0.01% on the sell only.
    const buy = chargesFor({ segment: 'commodity', product: 'NRML', side: 'buy', exchange: 'MCX', price: 140_573, quantity: 10 });
    expect(buy).toMatchObject({ brokerage: 20, stt: 0, exchange: 29.52, stamp: 28.11 });
    expect(chargesFor({ segment: 'commodity', product: 'NRML', side: 'sell', exchange: 'MCX', price: 140_573, quantity: 10 }).stt).toBe(140.57);
    expect(chargesFor({ segment: 'us-equity', product: 'CNC', side: 'buy', exchange: 'NASDAQ', price: 200, quantity: 100 }).total).toBe(0);
    expect(chargesFor({ segment: 'us-equity', product: 'CNC', side: 'sell', exchange: 'NASDAQ', price: 200, quantity: 100 })).toMatchObject({ exchange: 0.57, total: 0.57 });
    expect(chargesFor({ segment: 'forex', product: 'MIS', side: 'sell', exchange: 'FX', price: 1.1, quantity: 100_000 }).total).toBe(0);
  });

  it('gives each currency its own starting cash and limits scaled from the rupee settings', () => {
    const base = { initialCash: 1_000_000, limits: DEFAULT_RISK_LIMITS };
    expect(accountTermsFor('INR', base)).toEqual(base);
    expect(accountTermsFor('USD', base).initialCash).toBe(100_000);
    expect(accountTermsFor('SEK', base).initialCash).toBe(100_000);
    expect(accountTermsFor('USD', base).limits).toMatchObject({ maxOrderValue: 50_000, maxDailyLoss: 5_000, maxOpenPositions: 10 });
  });
});
