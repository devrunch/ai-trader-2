import { KiteConnect } from 'kiteconnect';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { KiteSessionService } from '../../../../shared/vendors/kite';
import type { RedisTokenBucket } from '../../../../shared/redis';
import type { HistoryInstruments } from '../../application/ports/history-instruments';
import type { PreviousCloseSource } from '../../application/ports/previous-close';

interface KiteOhlcClient { setAccessToken(token: string): void; getOHLC(instruments: string[]): Promise<unknown> }
const reply = z.record(z.string(), z.object({ ohlc: z.object({ close: z.number() }) }));

/** Kite /quote/ohlc: `ohlc.close` is the exchange's official previous close (closing-auction price included). */
export class KitePreviousCloseSource implements PreviousCloseSource {
  private readonly createClient: () => KiteOhlcClient;
  constructor(private readonly session: Pick<KiteSessionService, 'getAccessToken'>, private readonly instruments: Pick<HistoryInstruments, 'getMapping'>,
    private readonly bucket: Pick<RedisTokenBucket, 'take'>, client: string | (() => KiteOhlcClient)) {
    this.createClient = typeof client === 'string' ? () => new KiteConnect({ api_key: client, timeout: 10000, debug: false }) : client;
  }

  async fetch(instrumentId: string, signal: AbortSignal): Promise<number | null> {
    const mapping = await this.instruments.getMapping(instrumentId, 'kite', signal);
    if (!mapping) return null;
    await this.bucket.take(signal);
    return withTimeout(async abort => {
      const client = this.createClient();
      client.setAccessToken(await this.session.getAccessToken(abort));
      const parsed = reply.safeParse(await client.getOHLC([mapping.providerSymbol]));
      const close = parsed.success ? parsed.data[mapping.providerSymbol]?.ohlc.close : undefined;
      return close !== undefined && close > 0 ? close : null;
    }, 10_000, signal);
  }
}
