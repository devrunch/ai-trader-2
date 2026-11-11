import { z } from 'zod';
import type { PaperFill, PaperOrder, PaperPosition } from '@aitrader/contracts';
import type { FillRecord, InCurrency, MarkedPosition, OrderRecord } from '../application';

export const OrdersQuerySchema = z.strictObject({
  status: z.enum(['open', 'all']).default('all'),
  limit: z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().int().min(1).max(500)).default(200),
});
export const FillsQuerySchema = OrdersQuerySchema.pick({ limit: true });
export const OrderIdSchema = z.uuid();

/** Internal bookkeeping (account, segment, tick, reference price) stays on the server. */
export function toOrderDto(order: InCurrency<OrderRecord>): PaperOrder {
  return {
    id: order.id, clientOrderId: order.clientOrderId, instrumentId: order.instrumentId, currency: order.currency, side: order.side, type: order.type, product: order.product,
    quantity: order.quantity, limitPrice: order.limitPrice, triggerPrice: order.triggerPrice, stopLoss: order.stopLoss, target: order.target,
    status: order.status, triggered: order.triggered, rejectReason: order.rejectReason, closeReason: order.closeReason, parentOrderId: order.parentOrderId,
    fillPrice: order.fillPrice, placedAt: order.placedAt, expiresAt: order.expiresAt, filledAt: order.filledAt, updatedAt: order.updatedAt,
  };
}

export function toPositionDto(position: MarkedPosition): PaperPosition {
  return { instrumentId: position.instrumentId, currency: position.currency, product: position.product, quantity: position.quantity, averagePrice: position.averagePrice,
    realisedPnl: position.realisedPnl, lastPrice: position.lastPrice, unrealisedPnl: position.unrealisedPnl, squareOffAt: position.squareOffAt };
}

export function toFillDto(fill: InCurrency<FillRecord>): PaperFill {
  return { id: fill.id, orderId: fill.orderId, instrumentId: fill.instrumentId, currency: fill.currency, side: fill.side, product: fill.product, quantity: fill.quantity,
    price: fill.price, slippage: fill.slippage, charges: fill.charges, realisedPnl: fill.realisedPnl, filledAt: fill.filledAt };
}
