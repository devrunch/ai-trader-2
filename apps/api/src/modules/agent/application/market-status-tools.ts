import { z } from 'zod';
import { marketStatus, type MarketStatus } from '../../market-data/application/index';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

const TARGET = z.string().regex(/^[A-Z0-9_]+(:[A-Z0-9_&.!-]+)?$/, 'a canonical id like NSE:RELIANCE, or an exchange like NSE, FX, CRYPTO, NASDAQ, MCX');

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

const describe = (s: MarketStatus, at: number): string => {
  if (s.open) return `${s.exchange} is open${s.nextClose ? ` until ${iso(s.nextClose) ?? ''}` : ' (24/7)'}.`;
  return `${s.exchange} is closed (${s.closedReason ?? 'unknown'}${s.holiday ? `: ${s.holiday}` : ''})${s.nextOpen ? `; next open ${iso(s.nextOpen) ?? ''}` : ''} as of ${iso(at) ?? ''}.`;
};

/** The one line the desk reads about whether the market was open at its as-of time; null for an instrument with no calendar. */
export function deskMarketLine(symbol: string, asOf: number): string | null {
  try { return describe(marketStatus(symbol, asOf), asOf); } catch { return null; }
}

/** Sessions and holidays for every market the app trades (NSE/NFO/MCX, US, forex, metals, crypto). */
export function buildMarketStatusTools(deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'getMarketStatus',
    description: 'Whether a market is open now (or at a past time), the current session, next open and close, and why it is closed (weekend, holiday with its name, before open, after close). '
      + 'Pass a symbol or an exchange (NSE, NFO, MCX, NASDAQ, NYSE, FX, OANDA, CRYPTO). Forex also lists which of Sydney, Tokyo, London and New York are active. Crypto is always open. Check this before treating a quote as live.',
    input: z.strictObject({ target: TARGET, at: z.number().int().positive().optional() }),
    run: (input): Promise<unknown> => {
      const at = input.at ?? Date.now();
      try {
        const s = marketStatus(input.target, at);
        return Promise.resolve({ target: input.target, asOf: iso(at), summary: describe(s, at), ...s, session: s.session && { open: iso(s.session.open), close: iso(s.session.close) }, nextOpen: iso(s.nextOpen), nextClose: iso(s.nextClose) });
      } catch { return Promise.resolve({ target: input.target, available: false, reason: 'No market calendar for this exchange' }); }
    } }, deps)];
}
