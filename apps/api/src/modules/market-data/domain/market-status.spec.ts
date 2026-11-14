import { describe, expect, it } from 'vitest';
import { marketStatus } from './market-status';

const at = (iso: string): number => Date.parse(iso);

describe('marketStatus', () => {
  it('reports NSE open during the cash session with the close time', () => {
    const s = marketStatus('NSE:RELIANCE', at('2026-11-13T05:00:00Z')); // Fri 10:30 IST
    expect(s).toMatchObject({ open: true, market: 'india', closedReason: null, nextClose: at('2026-11-13T10:00:00Z') });
  });
  it('reports NSE closed on a weekend and names Monday 09:15 IST as the next open', () => {
    const s = marketStatus('NSE', at('2026-11-14T08:00:00Z')); // Sat
    expect(s).toMatchObject({ open: false, closedReason: 'weekend', nextOpen: at('2026-11-16T03:45:00Z') });
  });
  it('names the holiday on an NSE holiday', () => {
    const s = marketStatus('NSE:INFY', at('2026-01-26T05:00:00Z'));
    expect(s).toMatchObject({ open: false, closedReason: 'holiday', holiday: 'Republic Day' });
  });
  it('reports before-open and after-close on a trading day', () => {
    expect(marketStatus('NSE', at('2026-11-13T03:00:00Z')).closedReason).toBe('before-open');
    expect(marketStatus('NSE', at('2026-11-13T11:00:00Z')).closedReason).toBe('after-close');
  });
  it('keeps NSE derivatives open to 15:40 IST', () => {
    expect(marketStatus('NSE:NIFTY1!', at('2026-11-13T10:05:00Z')).open).toBe(true);
    expect(marketStatus('NSE:RELIANCE', at('2026-11-13T10:05:00Z')).open).toBe(false);
  });
  it('closes forex on Friday 22:00 UTC and reopens Sunday 22:00 UTC', () => {
    const fri = marketStatus('FX:EURUSD', at('2026-11-13T22:30:00Z'));
    expect(fri).toMatchObject({ open: false, nextOpen: at('2026-11-15T22:00:00Z') });
    expect(marketStatus('FX:EURUSD', at('2026-11-13T21:00:00Z')).nextClose).toBe(at('2026-11-13T22:00:00Z'));
  });
  it('lists the forex centres that are active', () => {
    const s = marketStatus('FX:EURUSD', at('2026-11-12T14:00:00Z'));
    expect(s.forexSessions?.filter(c => c.open).map(c => c.name)).toEqual(['London', 'New York']);
  });
  it('treats crypto as always open with no next close', () => {
    expect(marketStatus('CRYPTO:BTCUSD', at('2026-11-14T03:00:00Z'))).toMatchObject({ open: true, market: 'crypto', nextClose: null, closedReason: null });
  });
  it('reports US open at the NY session and closed on Thanksgiving', () => {
    expect(marketStatus('NASDAQ:AAPL', at('2026-11-13T15:00:00Z')).open).toBe(true);
    expect(marketStatus('NASDAQ:AAPL', at('2026-11-26T15:00:00Z'))).toMatchObject({ open: false, closedReason: 'holiday' });
  });
  it('throws for an unknown exchange', () => { expect(() => marketStatus('NOPE:X', 0)).toThrow(); });
});
