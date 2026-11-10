import { NotFoundError } from '../../../shared/errors';
import type { ResolveInstrument } from '../../instruments/application/index';
import { sessionAt, type GetQuote, type MarketDataService, type RequestSubscription } from '../../market-data/application/index';
import type { PaperMarket } from '../application/ports/paper-market';
import type { PriceBar } from '../domain/matching';
import type { TradableInstrument } from '../domain/segment';
import type { Session } from '../domain/session-rules';

/** A session's worth of minutes (375 for NSE) with room for a long derivatives day. */
const BAR_LIMIT = 1000;
type Warn = (message: string, detail: Record<string, unknown>) => void;

/** Paper trading's view of the instrument master, quotes, bars and calendars. Reads only; no broker is involved. */
export class MarketDataPaperMarket implements PaperMarket {
  private readonly held = new Set<string>();

  constructor(private readonly resolve: Pick<ResolveInstrument, 'execute'>, private readonly quotes: Pick<GetQuote, 'execute'>,
    private readonly market: Pick<MarketDataService, 'bars'>, private readonly subscriptions: Pick<RequestSubscription, 'acquire' | 'release'>,
    private readonly warn: Warn) {}

  async instrument(id: string): Promise<TradableInstrument> {
    const { instrument } = await this.resolve.execute(id);
    return { id: instrument.id.toString(), exchange: instrument.exchange, type: instrument.type, currency: instrument.currency,
      status: instrument.status, lotSize: instrument.lotSize, tick: instrument.minmov / instrument.pricescale };
  }

  async quote(instrumentId: string): Promise<{ price: number; at: number } | null> {
    try {
      const quote = await this.quotes.execute(instrumentId);
      return { price: quote.price, at: quote.at };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  async barsSince(instrumentId: string, since: number): Promise<PriceBar[]> {
    const page = await this.market.bars(instrumentId, '1', { since }, BAR_LIMIT);
    return page.bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));
  }

  session(instrumentId: string, at: number): Session | null { return sessionAt(instrumentId, at); }

  /** Best effort: a lease that fails is retried on the next pass; bars may still arrive through other subscribers. */
  async watch(instrumentIds: readonly string[]): Promise<void> {
    const wanted = new Set(instrumentIds);
    for (const id of [...this.held].filter(held => !wanted.has(held))) {
      this.held.delete(id);
      await this.subscriptions.release(id).catch((error: unknown) => { this.warn('paper feed release failed', { instrumentId: id, error: message(error) }); });
    }
    for (const id of wanted) {
      if (this.held.has(id)) continue;
      try { await this.subscriptions.acquire(id); this.held.add(id); }
      catch (error) { this.warn('paper feed subscription failed', { instrumentId: id, error: message(error) }); }
    }
  }
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
