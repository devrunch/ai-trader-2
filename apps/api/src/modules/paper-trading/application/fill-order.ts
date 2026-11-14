import { chargesFor } from '../domain/cost-model';
import type { WorkingOrder } from '../domain/matching';
import { roundMoney } from '../domain/money';
import { RELEASE_WINDOW, releaseSlippage } from '../domain/release-slippage';
import { applyFill, FLAT } from '../domain/position';
import type { Segment } from '../domain/segment';
import type { PaperDeps } from './paper-settings';
import type { OrderRecord, PaperUnitOfWork, PositionRecord } from './ports/paper-store';

export interface FillFacts { price: number; slippage: number; at: number }

export function exchangeOf(instrumentId: string): string { return instrumentId.slice(0, instrumentId.indexOf(':')); }

export function workingOrder(order: OrderRecord, slippageAt: (at: number) => number): WorkingOrder {
  return { side: order.side, type: order.type, limitPrice: order.limitPrice, triggerPrice: order.triggerPrice, triggered: order.triggered,
    placedAt: order.placedAt, tick: order.tick, slippageAt };
}

/** The slippage rate for fills of this instrument between two moments: the normal rate, wider around a high-impact release. A calendar outage keeps the normal rate. */
export async function slippageFor(instrumentId: string, from: number, to: number, deps: PaperDeps): Promise<(at: number) => number> {
  const base = deps.settings.slippageRate;
  const releases = await deps.releases?.near(instrumentId, from - RELEASE_WINDOW.afterMs, to + RELEASE_WINDOW.beforeMs).catch(() => []) ?? [];
  return at => releaseSlippage(base, at, releases);
}

function requireSegment(order: Pick<OrderRecord, 'segment' | 'id'>): Segment {
  if (order.segment === null) throw new Error(`Order ${order.id} has no segment`);
  return order.segment;
}

/**
 * Fills an open order inside its account transaction: the order, the fill, the position, the cash and the exits move together.
 * Idempotent: the conditional close is the guard, and `paper_fills.order_id` is unique as a second one. Returns false if
 * the order was no longer open.
 */
export async function fillOrder(tx: PaperUnitOfWork, order: OrderRecord, facts: FillFacts, deps: PaperDeps): Promise<boolean> {
  if (!await tx.closeOrder(order.id, { status: 'filled', fillPrice: facts.price, filledAt: facts.at }, facts.at)) return false;
  const segment = requireSegment(order);
  const charges = chargesFor({ segment, product: order.product, side: order.side, exchange: exchangeOf(order.instrumentId), price: facts.price, quantity: order.quantity });
  const positions = await tx.positions();
  const existing = positions.find(p => p.instrumentId === order.instrumentId && p.product === order.product);
  const { position, realised } = applyFill(existing ?? FLAT, order.side, order.quantity, facts.price);
  const opened = (existing?.quantity ?? 0) === 0 && position.quantity !== 0;
  const next: PositionRecord = {
    id: existing?.id ?? deps.ids(), accountId: order.accountId, instrumentId: order.instrumentId, segment, tick: order.tick, product: order.product, ...position,
    squareOffAt: order.product !== 'MIS' || position.quantity === 0 ? null : opened ? order.expiresAt : existing?.squareOffAt ?? order.expiresAt,
    updatedAt: facts.at,
  };
  await tx.savePosition(next);
  await tx.insertFill({ id: deps.ids(), orderId: order.id, accountId: order.accountId, instrumentId: order.instrumentId, side: order.side,
    product: order.product, quantity: order.quantity, price: facts.price, slippage: facts.slippage, charges, realisedPnl: realised, filledAt: facts.at });
  const account = await tx.account();
  await tx.saveAccount({ cash: roundMoney(account.cash + realised - charges.total), realisedPnl: roundMoney(account.realisedPnl + realised),
    charges: roundMoney(account.charges + charges.total) });
  await settleExits(tx, order, next, facts, deps);
  deps.events?.filled({ userId: account.userId, instrumentId: order.instrumentId, side: order.side, quantity: order.quantity, price: facts.price,
    realised, clientOrderId: order.clientOrderId });
  return true;
}

// An entry with a stop-loss or target gets exit orders; an exit filling, or the position going flat, cancels the remaining exits.
async function settleExits(tx: PaperUnitOfWork, order: OrderRecord, position: PositionRecord, facts: FillFacts, deps: PaperDeps): Promise<void> {
  const open = await tx.openOrders();
  const stale = open.filter(o => o.parentOrderId !== null && ((order.parentOrderId !== null && o.parentOrderId === order.parentOrderId)
    || (position.quantity === 0 && o.instrumentId === order.instrumentId && o.product === order.product)));
  for (const exit of stale) await tx.closeOrder(exit.id, { status: 'cancelled', closeReason: 'OCO' }, facts.at);
  if (order.parentOrderId !== null || position.quantity === 0) return;
  const side = order.side === 'buy' ? 'sell' : 'buy';
  const base = { ...order, side, stopLoss: null, target: null, triggered: false, parentOrderId: order.id, referencePrice: facts.price,
    fillPrice: null, filledAt: null, placedAt: facts.at, updatedAt: facts.at, status: 'open', rejectReason: null, closeReason: null } as const;
  if (order.stopLoss !== null) {
    await tx.insertOrder({ ...base, id: deps.ids(), clientOrderId: `${order.clientOrderId}#sl`, type: 'stop', limitPrice: null, triggerPrice: order.stopLoss });
  }
  if (order.target !== null) {
    await tx.insertOrder({ ...base, id: deps.ids(), clientOrderId: `${order.clientOrderId}#tp`, type: 'limit', limitPrice: order.target, triggerPrice: null });
  }
}
