import { DEFAULT_RISK_LIMITS, type RiskLimits } from '../domain/risk';

export interface PaperSettings {
  initialCash: number;
  /** Adverse slippage on market-style fills: 3 bps, about a liquid NSE stock's half spread plus impact. */
  slippageRate: number;
  /** A quote older than this can't fill a market order at placement; the order waits for the next bar. */
  freshQuoteMs: number;
  limits: RiskLimits;
}

export const DEFAULT_PAPER_SETTINGS: PaperSettings = {
  initialCash: 1_000_000, slippageRate: 0.0003, freshQuoteMs: 120_000, limits: DEFAULT_RISK_LIMITS,
};

export interface PaperDeps { clock: () => number; ids: () => string; settings: PaperSettings }
