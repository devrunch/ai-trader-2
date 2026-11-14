import { KiteConnect } from 'kiteconnect';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { KiteSessionService } from '../../../shared/vendors/kite';
import type { RedisTokenBucket } from '../../../shared/redis';
import type { OptionQuotes, QuotedLeg } from '../application/ports/options-ports';

interface KiteQuoteClient { setAccessToken(token: string): void; getQuote(instruments: string[]): Promise<unknown> }
const reply = z.record(z.string(), z.unknown());
const leg = z.object({ last_price: z.number(), oi: z.number().nullish(), volume: z.number().nullish() });
/** Kite accepts up to 500 instruments per /quote call. */
const BATCH = 500;

/** Parses a Kite /quote reply; a payload that is not a symbol map is an error, never an empty success. A single malformed entry is left out, not fatal. */
export function parseKiteQuotes(payload: unknown): Map<string, QuotedLeg> {
  const entries = Object.entries(reply.parse(payload));
  const out = new Map(entries.flatMap(([symbol, raw]) => {
    const q = leg.safeParse(raw);
    return q.success ? [[symbol, { ltp: q.data.last_price > 0 ? q.data.last_price : null, oi: q.data.oi ?? null, volume: q.data.volume ?? null }] as const] : [];
  }));
  if (entries.length > 0 && out.size === 0) throw new Error('Kite /quote: no entry has a price');
  return out;
}

/** Kite /quote with open interest: one call per 500 symbols, on the shared 1 request/second quote bucket. */
export class KiteOptionQuotes implements OptionQuotes {
  private readonly createClient: () => KiteQuoteClient;
  constructor(private readonly session: Pick<KiteSessionService, 'getAccessToken'>, private readonly bucket: Pick<RedisTokenBucket, 'take'>, client: string | (() => KiteQuoteClient)) {
    this.createClient = typeof client === 'string' ? () => new KiteConnect({ api_key: client, timeout: 10000, debug: false }) : client;
  }

  async quote(symbols: string[], signal: AbortSignal): Promise<Map<string, QuotedLeg>> {
    const out = new Map<string, QuotedLeg>();
    for (let i = 0; i < symbols.length; i += BATCH) {
      await this.bucket.take(signal);
      const batch = symbols.slice(i, i + BATCH);
      const answer = await withTimeout(async abort => {
        const client = this.createClient();
        client.setAccessToken(await this.session.getAccessToken(abort));
        return parseKiteQuotes(await client.getQuote(batch));
      }, 10_000, signal);
      for (const [symbol, leg] of answer) out.set(symbol, leg);
    }
    return out;
  }
}
