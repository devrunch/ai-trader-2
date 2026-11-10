import type { PaperSide } from '@aitrader/contracts';
import { roundMoney } from './money';

/** Signed quantity: positive long, negative short. */
export interface PositionState { quantity: number; averagePrice: number; realisedPnl: number }

export const FLAT: PositionState = { quantity: 0, averagePrice: 0, realisedPnl: 0 };

const PRICE_DECIMALS = 1e6;

/** Nets a fill into a position. Closing quantity realises P&L against the average; a flip opens the rest at the fill price. */
export function applyFill(position: PositionState, side: PaperSide, quantity: number, price: number): { position: PositionState; realised: number } {
  const signed = side === 'buy' ? quantity : -quantity;
  const current = position.quantity;
  const after = current + signed;
  if (current === 0 || Math.sign(current) === Math.sign(signed)) {
    const averagePrice = Math.round(((Math.abs(current) * position.averagePrice + quantity * price) / Math.abs(after)) * PRICE_DECIMALS) / PRICE_DECIMALS;
    return { position: { quantity: after, averagePrice, realisedPnl: position.realisedPnl }, realised: 0 };
  }
  const closed = Math.min(Math.abs(current), quantity);
  const realised = roundMoney(closed * (price - position.averagePrice) * Math.sign(current));
  const averagePrice = after === 0 ? 0 : Math.sign(after) === Math.sign(current) ? position.averagePrice : price;
  return { position: { quantity: after, averagePrice, realisedPnl: roundMoney(position.realisedPnl + realised) }, realised };
}

export function unrealisedPnl(position: Pick<PositionState, 'quantity' | 'averagePrice'>, lastPrice: number): number {
  return roundMoney(position.quantity * (lastPrice - position.averagePrice));
}

/** How much a fill adds to the absolute size of a position (0 when it only reduces it). */
export function exposureIncrease(current: number, side: PaperSide, quantity: number): number {
  const after = current + (side === 'buy' ? quantity : -quantity);
  return Math.max(0, Math.abs(after) - Math.abs(current));
}
