import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../../shared/errors';
import { InstrumentId } from '../../instruments/application/index';
import { MarketDataPaperMarket } from './market-data-paper-market';

const instrument = {
  id: InstrumentId.parse('NSE:INFY'), exchange: 'NSE', ticker: 'INFY', description: 'Infosys', type: 'stock' as const, currency: 'INR',
  timezone: 'Asia/Kolkata', session: '0915-1530', pricescale: 20, minmov: 1, lotSize: 1, hasIntraday: true, volumeType: 'real' as const,
  status: 'active' as const, aliases: [],
};
const status = { state: 'ok' as const };

function fixture() {
  const resolve = { execute: vi.fn().mockResolvedValue({ instrument }) };
  const quotes = { execute: vi.fn().mockResolvedValue({ instrumentId: 'NSE:INFY', resolvedId: 'NSE:INFY', price: 1500, at: 5, change: null, changePct: null, status }) };
  const bars = { bars: vi.fn().mockResolvedValue({ instrumentId: 'NSE:INFY', resolvedId: 'NSE:INFY', interval: '1', nextBefore: null, status,
    bars: [{ time: 60_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }] }) };
  const subscriptions = { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) };
  const warn = vi.fn();
  return { resolve, quotes, bars, subscriptions, warn, market: new MarketDataPaperMarket(resolve, quotes, bars, subscriptions, warn) };
}

describe('MarketDataPaperMarket (paper trading reads market data only)', () => {
  it('maps an instrument with its tick from minmov and pricescale', async () => {
    expect(await fixture().market.instrument('nse:infy')).toEqual({ id: 'NSE:INFY', exchange: 'NSE', type: 'stock', currency: 'INR', status: 'active', lotSize: 1, tick: 0.05 });
  });

  it('returns the quote price and bar time, and null when there is no price yet', async () => {
    const f = fixture();
    expect(await f.market.quote('NSE:INFY')).toEqual({ price: 1500, at: 5 });
    f.quotes.execute.mockRejectedValueOnce(new NotFoundError('No price yet'));
    expect(await f.market.quote('NSE:INFY')).toBeNull();
    f.quotes.execute.mockRejectedValueOnce(new Error('redis down'));
    await expect(f.market.quote('NSE:INFY')).rejects.toThrow('redis down');
  });

  it('reads one-minute bars since a time', async () => {
    const f = fixture();
    expect(await f.market.barsSince('NSE:INFY', 60_000)).toEqual([{ time: 60_000, open: 1, high: 2, low: 0.5, close: 1.5 }]);
    expect(f.bars.bars).toHaveBeenCalledWith('NSE:INFY', '1', { since: 60_000 }, 1000);
  });

  it('holds one subscription per watched instrument and releases the ones no longer needed', async () => {
    const f = fixture();
    await f.market.watch(['NSE:INFY', 'NSE:TCS']);
    await f.market.watch(['NSE:TCS']);
    expect(f.subscriptions.acquire.mock.calls).toEqual([['NSE:INFY'], ['NSE:TCS']]);
    expect(f.subscriptions.release.mock.calls).toEqual([['NSE:INFY']]);
  });

  it('keeps going when a subscription fails, and retries it next time', async () => {
    const f = fixture();
    f.subscriptions.acquire.mockRejectedValueOnce(new Error('redis down'));
    await f.market.watch(['NSE:INFY']);
    await f.market.watch(['NSE:INFY']);
    expect(f.subscriptions.acquire).toHaveBeenCalledTimes(2);
    expect(f.warn).toHaveBeenCalledWith('paper feed subscription failed', { instrumentId: 'NSE:INFY', error: 'redis down' });
  });

  it('answers sessions from the instrument calendar', () => {
    const market = fixture().market;
    expect(market.session('NSE:INFY', Date.parse('2026-11-11T04:30:00Z'))).toEqual({ open: Date.parse('2026-11-11T03:45:00Z'), close: Date.parse('2026-11-11T10:00:00Z') });
    expect(market.session('NSE:INFY', Date.parse('2026-11-15T04:30:00Z'))).toBeNull();
  });
});
