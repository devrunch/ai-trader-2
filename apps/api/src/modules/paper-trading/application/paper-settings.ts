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

/** A fill, for whoever wants to tell the user (in-app notifications). Raised inside the fill's transaction. */
interface PaperFillEvent { userId: string; instrumentId: string; side: 'buy' | 'sell'; quantity: number; price: number; realised: number; clientOrderId: string }
/** High-impact release times that move an instrument, between two moments. */
export interface ReleaseWindows { near(instrumentId: string, from: number, to: number): Promise<number[]> }
export interface PaperDeps { clock: () => number; ids: () => string; settings: PaperSettings; events?: { filled(event: PaperFillEvent): void }; releases?: ReleaseWindows }
