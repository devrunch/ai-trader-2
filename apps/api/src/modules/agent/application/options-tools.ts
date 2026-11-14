import { z } from 'zod';
import type { OptionChain, OptionsSummary } from '@aitrader/contracts';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

/** The options module's application API, as the agent sees it. */
export interface OptionsPort {
  chain(underlying: string, q: { expiry?: string | undefined; strikes: number; asOf?: number | undefined }, signal: AbortSignal): Promise<OptionChain | null>;
  summary(underlying: string, q: { expiry?: string | undefined; asOf?: number | undefined }, signal: AbortSignal): Promise<OptionsSummary | null>;
}

const SOURCE = 'kite option quotes';
const TIMEOUT_MS = 20_000;
const underlying = z.string().regex(/^(NSE:)?[A-Za-z0-9&-]{1,20}$/, 'an index or stock with F&O: NIFTY, BANKNIFTY, RELIANCE');
const expiry = z.iso.date().optional();
const asOf = z.iso.datetime({ offset: true }).optional();

const unavailable = (reason: string) => ({ available: false, source: SOURCE, reason });

/** Strike data for India F&O underlyings: prices, open interest and its change, implied volatility, put-call ratio and max pain; numbers are computed server-side from Kite quotes. */
export function buildOptionsTools(options: OptionsPort, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'getOptionChain',
      description: 'Option chain of an NSE F&O underlying (index or stock) for one expiry: the strikes around the at-the-money strike with call and put last price, open interest, open-interest change since the previous trading day\'s close snapshot '
        + '(null until we hold one), volume and implied volatility (percent, from the traded price; null if it cannot be computed), plus spot, the ATM strike and the listed expiries. Default expiry is the nearest. '
        + 'Live snapshots are reused for a minute; `asOf` replays a stored snapshot, and none may exist. India only; there are no option chains for US, forex or crypto.',
      input: z.strictObject({ underlying, expiry, strikes: z.number().int().min(1).max(20).default(8), asOf }),
      run: async input => {
        const chain = await options.chain(input.underlying, { expiry: input.expiry, strikes: input.strikes, asOf: input.asOf ? Date.parse(input.asOf) : undefined }, AbortSignal.timeout(TIMEOUT_MS));
        return chain ? { available: true, ...chain } : unavailable('no stored snapshot at that time');
      } }, deps),
    guardedTool({ name: 'getOptionsSummary',
      description: 'Positioning summary of an NSE F&O underlying for one expiry: put-call ratio by open interest, max pain strike, total call and put open interest, and the biggest open-interest build-ups against the previous trading day\'s close. '
        + 'Use it to read where writers are positioned; it says nothing about direction by itself. Default expiry is the nearest; `asOf` replays a stored snapshot.',
      input: z.strictObject({ underlying, expiry, asOf }),
      run: async input => {
        const summary = await options.summary(input.underlying, { expiry: input.expiry, asOf: input.asOf ? Date.parse(input.asOf) : undefined }, AbortSignal.timeout(TIMEOUT_MS));
        return summary ? { available: true, ...summary } : unavailable('no stored snapshot at that time');
      } }, deps),
  ];
}
