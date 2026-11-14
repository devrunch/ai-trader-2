import { describe, expect, it } from 'vitest';
import { buildups, maxPain, nearestStrike, pcr, type SnapshotLeg } from './chain-stats';
import { impliedVolPct } from './implied-vol';

const leg = (strike: number, type: 'CE' | 'PE', oi: number | null): SnapshotLeg => ({ symbol: `X${String(strike)}${type}`, strike, type, ltp: 1, oi, volume: 0 });
const LEGS = [leg(100, 'CE', 100), leg(110, 'CE', 300), leg(120, 'CE', 200), leg(100, 'PE', 200), leg(110, 'PE', 300), leg(120, 'PE', 100)];

describe('chain statistics', () => {
  it('computes PCR as put open interest over call open interest', () => {
    expect(pcr(LEGS)).toBe(1);
    expect(pcr([leg(100, 'CE', 600), leg(100, 'PE', 300)])).toBe(0.5);
  });
  it('returns a null PCR when no call has open interest', () => {
    expect(pcr([leg(100, 'PE', 300)])).toBeNull();
  });
  it('finds the max pain strike on fixed data', () => {
    // At 110: calls 100*10 = 1000, puts 100*10 = 1000 -> 2000; at 100: 300*10+200*20 = 7000; at 120: 100*20+300*10+... = 2000+3000+... larger.
    expect(maxPain(LEGS)).toBe(110);
  });
  it('takes the lower strike on a max pain tie and ignores strikes without open interest', () => {
    expect(maxPain([leg(100, 'CE', 10), leg(110, 'PE', 10), leg(105, 'CE', null)])).toBe(100);
    expect(maxPain([])).toBeNull();
  });
  it('lists the biggest open interest build-ups against the baseline', () => {
    const baseline = new Map([['X100CE', 90], ['X110CE', 100], ['X110PE', 400], ['X120PE', 100]]);
    expect(buildups(LEGS, baseline, 2)).toEqual([{ strike: 110, type: 'CE', oi: 300, oiChange: 200 }, { strike: 100, type: 'CE', oi: 100, oiChange: 10 }]);
  });
  it('picks the nearest strike to spot, the lower one on a tie', () => {
    expect(nearestStrike([120, 100, 110], 104)).toBe(100);
    expect(nearestStrike([100, 110], 105)).toBe(100);
    expect(nearestStrike([], 105)).toBeNull();
  });
});

describe('implied volatility', () => {
  const day = 86_400_000;
  const now = Date.UTC(2026, 10, 14);
  it('recovers the volatility of a Black-Scholes price (ATM call, 30 days, 20%)', () => {
    // Hand-computed Black-Scholes price for S=K=100, T=30/365, r=7%, sigma=20% is 2.57 (call).
    expect(impliedVolPct('CE', 2.57, 100, 100, now + 30 * day, now)).toBeCloseTo(20, 0);
  });
  it('is higher for a dearer option', () => {
    const cheap = impliedVolPct('PE', 2, 100, 100, now + 30 * day, now) ?? 0;
    const dear = impliedVolPct('PE', 4, 100, 100, now + 30 * day, now) ?? 0;
    expect(dear).toBeGreaterThan(cheap);
  });
  it('returns null below intrinsic value, with no price, and after expiry', () => {
    expect(impliedVolPct('CE', 5, 120, 100, now + day, now)).toBeNull();
    expect(impliedVolPct('CE', null, 100, 100, now + day, now)).toBeNull();
    expect(impliedVolPct('CE', 3, 100, 100, now - day, now)).toBeNull();
  });
});
