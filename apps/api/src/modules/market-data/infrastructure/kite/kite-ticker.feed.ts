import { CircuitBreaker, withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { KiteSessionService } from '../../../../shared/vendors/kite';
import type { HistoryInstruments } from '../../application/ports/history-instruments';
import type { CandleStore } from '../../application/ports/candle-store';
import type { FillHistory } from '../../application/fill-history';
import { calendarFor } from '../../domain/calendar';
import { ResilientFeed } from '../feed/resilient-feed';
import { gapBackfill } from '../feed/gap-backfill';
import { KiteTickerClient } from './kite-ticker.client';
import type { TickerMapping } from './kite-ws.client';
import { SubscriptionManager } from './subscription-manager';

const mappingToken = z.string().regex(/^\d+\/\d+$/).transform(value => Number(value.split('/')[1])).pipe(z.number().int().positive());
interface Dependencies {
  session: Pick<KiteSessionService, 'getAccessToken' | 'refresh'>;
  instruments: HistoryInstruments;
  fill: Pick<FillHistory, 'execute'>;
  store: CandleStore;
  apiKey: string;
  log: (reason: string, error: unknown) => void;
  clock?: () => number;
  root?: string;
  watchdogMs?: number;
}
export class KiteTickerFeed extends ResilientFeed {
  private readonly kill: () => void;
  constructor(deps: Dependencies) {
    const manager = new SubscriptionManager(); const mappings = new Map<string, TickerMapping>();
    const clock = deps.clock ?? Date.now;
    const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 30000, now: clock,
      isFailure: error => !(error instanceof Error && error.message === 'AUTH_EXPIRED') });
    let refreshedToken: string | undefined;
    const accessToken = async (parent: AbortSignal) => {
      const token = refreshedToken; refreshedToken = undefined;
      return token ?? withTimeout(signal => deps.session.getAccessToken(signal), 120000, parent);
    };
    let client: KiteTickerClient | undefined;
    super('kite', () => {
      client = new KiteTickerClient(deps.apiKey, accessToken, manager, mappings, breaker, deps.root, clock,
        reason => { deps.log(reason, new Error(reason)); }); return client;
    }, {
      // A first session mint can take 120 seconds; the socket itself remains bounded to 15 seconds.
      clock, log: deps.log, connectTimeoutMs: 135000, ...(deps.watchdogMs === undefined ? {} : { watchdogMs: deps.watchdogMs }),
      isOpen: (id, at) => calendarFor(id.split(':')[0] ?? '').isOpen(at),
      releaseKey: key => { manager.remove(key); mappings.delete(key); },
      resolveKey: async id => {
        const mapping = await withTimeout(signal => deps.instruments.getMapping(id, 'kite', signal), 5000);
        const parsed = mappingToken.safeParse(mapping?.providerToken);
        if (!parsed.success) return null;
        const key = String(parsed.data); manager.add(key);
        mappings.set(key, { id, token: parsed.data, volume: mapping?.volumeType !== 'none' }); return key;
      },
      refreshAuth: async signal => {
        // Invalidate an upstream-rejected token even when its local expiry is still in the future.
        await deps.session.refresh(signal); refreshedToken = await deps.session.getAccessToken(signal);
      },
      backfill: gapBackfill(deps.fill, deps.store, 'kite'),
    });
    this.kill = () => { client?.disconnectSocket(); };
  }
  disconnectSocket(): void { this.kill(); }
}
