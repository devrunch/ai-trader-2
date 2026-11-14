import { KiteConnect } from 'kiteconnect';
import { z } from 'zod';
import type { Depth } from '@aitrader/contracts';
import type { KiteSessionService } from '../../../../shared/vendors/kite';
import type { RedisTokenBucket } from '../../../../shared/redis';
import type { HistoryInstruments } from '../../application/ports/history-instruments';
import { buildDepth } from '../../domain/depth';
import { kiteQuoteCall, type KiteQuoteDeps } from './kite-quote-call';

interface KiteQuoteClient { setAccessToken(token: string): void; getQuote(instruments: string[]): Promise<unknown> }
const level = z.object({ price: z.number(), quantity: z.number(), orders: z.number().nullish() });
const reply = z.record(z.string(), z.object({ timestamp: z.union([z.string(), z.date()]).nullish(), depth: z.object({ buy: z.array(level), sell: z.array(level) }).nullish() }));

/** Kite /quote: the five-level book as the exchange left it, which is what is shown while the market is closed and no live book has been recorded. */
export class KiteDepthSnapshotSource {
  private readonly deps: KiteQuoteDeps<KiteQuoteClient>;
  constructor(session: Pick<KiteSessionService, 'getAccessToken'>, instruments: Pick<HistoryInstruments, 'getMapping'>,
    bucket: Pick<RedisTokenBucket, 'take'>, client: string | (() => KiteQuoteClient), private readonly now: () => number = Date.now) {
    this.deps = { session, instruments, bucket, createClient: typeof client === 'string' ? () => new KiteConnect({ api_key: client, timeout: 10000, debug: false }) : client };
  }

  fetch(instrumentId: string, signal: AbortSignal): Promise<Depth | null> {
    return kiteQuoteCall(this.deps, instrumentId, signal, async (client, symbol) => {
      const parsed = reply.safeParse(await client.getQuote([symbol]));
      const quote = parsed.success ? parsed.data[symbol] : undefined;
      if (!quote?.depth) return null;
      const at = quote.timestamp ? new Date(quote.timestamp).getTime() : this.now();
      const book = buildDepth({ instrumentId, at: Number.isFinite(at) ? at : this.now(), source: 'kite', levels: '5',
        bids: quote.depth.buy.map(l => ({ price: l.price, quantity: l.quantity, orders: l.orders ?? null })),
        asks: quote.depth.sell.map(l => ({ price: l.price, quantity: l.quantity, orders: l.orders ?? null })) });
      return book.bids.length + book.asks.length > 0 ? book : null;
    });
  }
}
