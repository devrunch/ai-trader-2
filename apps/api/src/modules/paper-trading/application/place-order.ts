import type { PaperPlaceOrderRequest } from '@aitrader/contracts';
import { ConflictError, ValidationError } from '../../../shared/errors';
import { accountTermsFor } from '../domain/currency';
import { matchAtPrice } from '../domain/matching';
import { InvalidOrderError, validateOrder } from '../domain/order';
import { checkRisk, type RiskLimits } from '../domain/risk';
import { segmentOf, type Segment, type TradableInstrument } from '../domain/segment';
import { orderExpiresAt, squareOffAt, type Session } from '../domain/session-rules';
import { exchangeOf, fillOrder, workingOrder } from './fill-order';
import { marginInUse } from './margin-in-use';
import type { PaperDeps } from './paper-settings';
import type { PaperMarket } from './ports/paper-market';
import type { InCurrency, OrderRecord, PaperStore, PaperUnitOfWork } from './ports/paper-store';

type Quote = { price: number; at: number } | null;

/**
 * Places a paper order (FR-PT-1..4). Idempotent by clientOrderId per account (FR-PT-3): a repeat returns the stored order,
 * a different order under the same id is a conflict. Gate failures are stored as rejected orders, so retries see them too.
 */
export class PlaceOrder {
  constructor(private readonly store: PaperStore, private readonly market: PaperMarket, private readonly deps: PaperDeps) {}

  /** Each order settles in its instrument's own currency account. */
  async execute(userId: string, request: PaperPlaceOrderRequest): Promise<InCurrency<OrderRecord>> {
    const instrument = await this.market.instrument(request.instrumentId);
    return { ...await this.place(userId, request, instrument), currency: instrument.currency };
  }

  private async place(userId: string, request: PaperPlaceOrderRequest, instrument: TradableInstrument): Promise<OrderRecord> {
    const terms = accountTermsFor(instrument.currency, this.deps.settings);
    const account = await this.store.accountFor(userId, instrument.currency, terms.initialCash);
    const existing = await this.store.orderByClientId(account.id, request.clientOrderId);
    if (existing) return sameOrder(existing, request, instrument.id);
    const segment = segmentOf(instrument);
    if (segment) validated(request, instrument, segment);
    const quote = await this.market.quote(instrument.id);
    const now = this.deps.clock();
    const session = this.market.session(instrument.id, now);
    return this.store.inAccount(account.id, async tx => {
      const again = await tx.orderByClientId(request.clientOrderId);
      if (again) return sameOrder(again, request, instrument.id);
      const order = await this.decide(tx, { accountId: account.id, request, instrument, segment, quote, session, now, limits: terms.limits });
      await tx.insertOrder(order);
      if (order.status !== 'open' || !quote || now - quote.at > this.deps.settings.freshQuoteMs) return order;
      const match = matchAtPrice(workingOrder(order, this.deps.settings.slippageRate), quote.price, now);
      if (match.kind !== 'fill') return order;
      await fillOrder(tx, order, match, this.deps);
      return (await tx.order(order.id)) ?? order;
    });
  }

  private async decide(tx: PaperUnitOfWork, input: { accountId: string; request: PaperPlaceOrderRequest; instrument: TradableInstrument;
    segment: Segment | null; quote: Quote; session: Session | null; now: number; limits: RiskLimits }): Promise<OrderRecord> {
    const { request, instrument, segment, session, now } = input;
    const exchange = exchangeOf(instrument.id);
    const [account, positions, open] = await Promise.all([tx.account(), tx.positions(), tx.openOrders()]);
    const risk = checkRisk({
      side: request.side, type: request.type, product: request.product, quantity: request.quantity,
      limitPrice: request.limitPrice ?? null, triggerPrice: request.triggerPrice ?? null, segment,
      marketOpen: session !== null, afterMisCutoff: session !== null && now >= squareOffAt(exchange, session),
      lastPrice: input.quote?.price ?? null,
      position: positions.find(p => p.instrumentId === instrument.id && p.product === request.product)?.quantity ?? 0,
      openPositions: positions.filter(p => p.quantity !== 0).length,
      dayPnl: session ? await tx.netPnlSince(session.open) : 0,
      availableMargin: account.cash - marginInUse(positions, open),
    }, input.limits);
    return {
      id: this.deps.ids(), accountId: input.accountId, clientOrderId: request.clientOrderId, instrumentId: instrument.id, segment, tick: instrument.tick,
      side: request.side, type: request.type, product: request.product, quantity: request.quantity,
      limitPrice: request.limitPrice ?? null, triggerPrice: request.triggerPrice ?? null, stopLoss: request.stopLoss ?? null, target: request.target ?? null,
      status: risk.ok ? 'open' : 'rejected', triggered: false, rejectReason: risk.ok ? null : risk.reason, closeReason: null, parentOrderId: null,
      referencePrice: input.quote?.price ?? null, fillPrice: null, placedAt: now,
      expiresAt: session ? orderExpiresAt(request.product, exchange, session) : now, filledAt: null, updatedAt: now,
    };
  }
}

function validated(request: PaperPlaceOrderRequest, instrument: TradableInstrument, segment: Segment): void {
  try { validateOrder(request, instrument, segment); }
  catch (error) {
    if (error instanceof InvalidOrderError) throw new ValidationError(error.message, { field: error.field });
    throw error;
  }
}

function sameOrder(existing: OrderRecord, request: PaperPlaceOrderRequest, instrumentId: string): OrderRecord {
  const same = existing.instrumentId === instrumentId && existing.side === request.side && existing.type === request.type
    && existing.product === request.product && existing.quantity === request.quantity
    && existing.limitPrice === (request.limitPrice ?? null) && existing.triggerPrice === (request.triggerPrice ?? null)
    && existing.stopLoss === (request.stopLoss ?? null) && existing.target === (request.target ?? null);
  if (!same) throw new ConflictError('clientOrderId was already used for a different order', { clientOrderId: request.clientOrderId, orderId: existing.id });
  return existing;
}
