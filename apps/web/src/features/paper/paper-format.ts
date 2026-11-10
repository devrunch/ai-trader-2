import type { PaperOrder, PaperRejectReason } from '@aitrader/contracts';

const rupees = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatRupees = (value: number): string => `₹${rupees.format(value)}`;

/** Signed with a true minus sign, for P&L. */
export const formatPnl = (value: number): string => `${value > 0 ? '+' : value < 0 ? '−' : ''}${rupees.format(Math.abs(value))}`;

const REJECTIONS: Record<PaperRejectReason, string> = {
  INSTRUMENT_NOT_ALLOWED: 'this instrument can’t be paper traded', MARKET_CLOSED: 'the market is closed',
  MIS_CUTOFF: 'intraday entries stop at the square-off time', NO_PRICE: 'there is no price for it yet',
  PRICE_BAND: 'the price is too far from the last price', TRIGGER_INVALID: 'the trigger is on the wrong side of the price',
  MAX_ORDER_VALUE: 'the order is larger than the order limit', MAX_POSITION_VALUE: 'the position would exceed its limit',
  MAX_OPEN_POSITIONS: 'too many open positions', DAILY_LOSS_LIMIT: 'today’s loss limit is reached',
  SHORT_DELIVERY: 'delivery sells need holdings', OPTION_WRITING: 'option writing isn’t supported', INSUFFICIENT_MARGIN: 'not enough margin',
};

export function describeOrder(order: PaperOrder): string {
  const what = `${order.side === 'buy' ? 'Buy' : 'Sell'} ${String(order.quantity)} ${order.instrumentId}`;
  if (order.status === 'rejected') return `${what} rejected: ${order.rejectReason ? REJECTIONS[order.rejectReason] : 'refused'}.`;
  if (order.status === 'filled' && order.fillPrice !== null) return `${what} filled at ${rupees.format(order.fillPrice)}.`;
  return `${what} is ${order.status}.`;
}
