import { withTimeout } from '@aitrader/resilience';
import type { KiteSessionService } from '../../../../shared/vendors/kite';
import type { RedisTokenBucket } from '../../../../shared/redis';
import type { HistoryInstruments } from '../../application/ports/history-instruments';

export interface KiteQuoteDeps<C> {
  session: Pick<KiteSessionService, 'getAccessToken'>;
  instruments: Pick<HistoryInstruments, 'getMapping'>;
  bucket: Pick<RedisTokenBucket, 'take'>;
  createClient: () => C & { setAccessToken(token: string): void };
}

/** One Kite quote-endpoint call for one instrument: its Kite symbol, a token from the shared quote bucket, a signed-in client and a 10 s ceiling. Null when it has no Kite symbol. */
export async function kiteQuoteCall<C, T>(deps: KiteQuoteDeps<C>, instrumentId: string, signal: AbortSignal, run: (client: C, providerSymbol: string) => Promise<T | null>): Promise<T | null> {
  const mapping = await deps.instruments.getMapping(instrumentId, 'kite', signal);
  if (!mapping) return null;
  await deps.bucket.take(signal);
  return withTimeout(async abort => {
    const client = deps.createClient();
    client.setAccessToken(await deps.session.getAccessToken(abort));
    return run(client, mapping.providerSymbol);
  }, 10_000, signal);
}
