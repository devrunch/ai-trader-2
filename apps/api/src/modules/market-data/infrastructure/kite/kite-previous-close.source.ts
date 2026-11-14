import { KiteConnect } from 'kiteconnect';
import { z } from 'zod';
import type { KiteSessionService } from '../../../../shared/vendors/kite';
import type { RedisTokenBucket } from '../../../../shared/redis';
import type { HistoryInstruments } from '../../application/ports/history-instruments';
import type { PreviousCloseSource } from '../../application/ports/previous-close';
import { kiteQuoteCall, type KiteQuoteDeps } from './kite-quote-call';

interface KiteOhlcClient { setAccessToken(token: string): void; getOHLC(instruments: string[]): Promise<unknown> }
const reply = z.record(z.string(), z.object({ ohlc: z.object({ close: z.number() }) }));

/** Kite /quote/ohlc: `ohlc.close` is the exchange's official previous close (closing-auction price included). */
export class KitePreviousCloseSource implements PreviousCloseSource {
  private readonly deps: KiteQuoteDeps<KiteOhlcClient>;
  constructor(session: Pick<KiteSessionService, 'getAccessToken'>, instruments: Pick<HistoryInstruments, 'getMapping'>,
    bucket: Pick<RedisTokenBucket, 'take'>, client: string | (() => KiteOhlcClient)) {
    this.deps = { session, instruments, bucket, createClient: typeof client === 'string' ? () => new KiteConnect({ api_key: client, timeout: 10000, debug: false }) : client };
  }

  fetch(instrumentId: string, signal: AbortSignal): Promise<number | null> {
    return kiteQuoteCall(this.deps, instrumentId, signal, async (client, symbol) => {
      const parsed = reply.safeParse(await client.getOHLC([symbol]));
      const close = parsed.success ? parsed.data[symbol]?.ohlc.close : undefined;
      return close !== undefined && close > 0 ? close : null;
    });
  }
}
