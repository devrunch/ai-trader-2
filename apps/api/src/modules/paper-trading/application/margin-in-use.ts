import { usedMargin } from '../domain/margin';
import type { OrderRecord, PositionRecord } from './ports/paper-store';

/** Margin held by positions plus working entry orders; exits only reduce a position, so they block nothing. */
export function marginInUse(positions: readonly PositionRecord[], openOrders: readonly OrderRecord[]): number {
  const entries = openOrders.flatMap(o => (o.parentOrderId === null && o.segment !== null ? [{
    quantity: o.quantity, segment: o.segment, product: o.product, price: o.limitPrice ?? o.triggerPrice ?? o.referencePrice ?? 0 }] : []));
  return usedMargin(positions, entries);
}
