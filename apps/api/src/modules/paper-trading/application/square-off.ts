import { matchAtPrice } from '../domain/matching';
import { fillOrder, slippageFor, workingOrder } from './fill-order';
import type { MatchOpenOrders } from './match-open-orders';
import type { PaperDeps } from './paper-settings';
import type { PaperMarket } from './ports/paper-market';
import type { OrderRecord, PaperStore, PositionRecord } from './ports/paper-store';

type Log = (message: string, detail: Record<string, unknown>) => void;

/**
 * Intraday square-off and day-order expiry (FR-PT-5), run every minute. Matching runs first so a crossing before the
 * expiry still fills. Expired orders leave the book; MIS positions past their square-off time are closed at the last price
 * with a market order whose clientOrderId names the position and the square-off time, so a re-run never closes twice.
 * Gates are skipped: a square-off must not be refused.
 */
export class SquareOff {
  constructor(private readonly store: PaperStore, private readonly market: PaperMarket, private readonly deps: PaperDeps,
    private readonly match: Pick<MatchOpenOrders, 'execute'>, private readonly log: Log = () => undefined) {}

  async execute(signal?: AbortSignal): Promise<{ expired: number; squaredOff: number }> {
    try { await this.match.execute(signal); }
    catch (error) { this.log('paper matching before square-off failed', { error: error instanceof Error ? error.message : String(error) }); }
    const now = this.deps.clock();
    let expired = 0;
    for (const order of await this.store.ordersExpiredBy(now)) {
      const closeReason = order.product === 'MIS' ? 'SQUARE_OFF' : 'SESSION_END';
      if (await this.store.inAccount(order.accountId, tx => tx.closeOrder(order.id, { status: 'expired', closeReason }, now))) expired++;
    }
    let squaredOff = 0;
    for (const position of await this.store.positionsDueForSquareOff(now)) {
      signal?.throwIfAborted();
      if (await this.flatten(position, now, signal)) squaredOff++;
    }
    return { expired, squaredOff };
  }

  private async flatten(position: PositionRecord, now: number, signal?: AbortSignal): Promise<boolean> {
    const quote = await this.market.quote(position.instrumentId, signal).catch((error: unknown) => {
      this.log('paper square-off quote failed', { instrumentId: position.instrumentId, error: error instanceof Error ? error.message : String(error) });
      return null;
    });
    if (!quote) this.log('paper square-off had no price; used the average price', { instrumentId: position.instrumentId, positionId: position.id });
    const price = quote?.price ?? position.averagePrice;
    const clientOrderId = `squareoff#${position.id}#${String(position.squareOffAt)}`;
    const slippageAt = await slippageFor(position.instrumentId, now, now, this.deps);
    return this.store.inAccount(position.accountId, async tx => {
      if (await tx.orderByClientId(clientOrderId)) return false;
      const current = (await tx.positions()).find(p => p.id === position.id);
      if (!current || current.quantity === 0) return false;
      const order: OrderRecord = {
        id: this.deps.ids(), accountId: position.accountId, clientOrderId, instrumentId: position.instrumentId, segment: position.segment, tick: position.tick,
        side: current.quantity > 0 ? 'sell' : 'buy', type: 'market', product: 'MIS', quantity: Math.abs(current.quantity),
        limitPrice: null, triggerPrice: null, stopLoss: null, target: null, status: 'open', triggered: false, rejectReason: null, closeReason: null,
        parentOrderId: null, referencePrice: price, fillPrice: null, placedAt: now, expiresAt: now, filledAt: null, updatedAt: now,
      };
      await tx.insertOrder(order);
      const match = matchAtPrice(workingOrder(order, slippageAt), price, now);
      if (match.kind !== 'fill') throw new Error('A market square-off must fill');
      return fillOrder(tx, order, match, this.deps);
    });
  }
}
