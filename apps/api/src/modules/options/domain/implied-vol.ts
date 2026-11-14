const RISK_FREE = 0.07;
const YEAR_MS = 365 * 86_400_000;

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 on erf, error below 1.5e-7). */
function cdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x / 2);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

function price(type: 'CE' | 'PE', spot: number, strike: number, years: number, sigma: number): number {
  const root = sigma * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (RISK_FREE + sigma * sigma / 2) * years) / root;
  const d2 = d1 - root;
  const discounted = strike * Math.exp(-RISK_FREE * years);
  return type === 'CE' ? spot * cdf(d1) - discounted * cdf(d2) : discounted * cdf(-d2) - spot * cdf(-d1);
}

/**
 * Black-Scholes implied volatility in percent from a traded price (no dividends, 7% rate, European exercise: index options; for stock options it is an estimate).
 * Null when the price is missing, at or below intrinsic value, or the contract has expired.
 */
export function impliedVolPct(type: 'CE' | 'PE', ltp: number | null, spot: number | null, strike: number, expiryMs: number, nowMs: number): number | null {
  const years = (expiryMs - nowMs) / YEAR_MS;
  if (ltp === null || spot === null || ltp <= 0 || spot <= 0 || years <= 0) return null;
  let low = 0.01;
  let high = 5;
  if (ltp <= price(type, spot, strike, years, low) || ltp >= price(type, spot, strike, years, high)) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (price(type, spot, strike, years, mid) < ltp) low = mid; else high = mid;
  }
  return Math.round((low + high) / 2 * 10_000) / 100;
}
