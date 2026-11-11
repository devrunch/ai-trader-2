import type { RiskLimits } from './risk';

/** Starting paper cash per currency, each about the same buying power as ₹10 lakh. Other currencies start at 100,000. */
const INITIAL_CASH: Readonly<Record<string, number>> = {
  INR: 1_000_000, USD: 100_000, EUR: 90_000, GBP: 80_000, JPY: 15_000_000, CAD: 135_000, CHF: 90_000, AUD: 150_000,
};
const scaleOf = (currency: string): number => (INITIAL_CASH[currency] ?? 100_000) / 1_000_000;

/**
 * One paper account per currency. The rupee settings are the base; every other currency gets its cash and money limits
 * scaled by the same ratio, so each account carries the same relative risk.
 */
export function accountTermsFor(currency: string, base: { initialCash: number; limits: RiskLimits }): { initialCash: number; limits: RiskLimits } {
  if (currency === 'INR') return base;
  const scale = scaleOf(currency);
  const { limits } = base;
  return { initialCash: base.initialCash * scale,
    limits: { ...limits, maxOrderValue: limits.maxOrderValue * scale, maxPositionValue: limits.maxPositionValue * scale, maxDailyLoss: limits.maxDailyLoss * scale } };
}
