import type { PaperOrder, PaperRejectReason } from '@aitrader/contracts';

const formats = new Map<string, Intl.NumberFormat>();
/** Rupees in lakh grouping, everything else Western; FX-sized prices keep five decimals. */
function formatter(currency: string, small: boolean, symbol: boolean): Intl.NumberFormat {
  const key = `${currency}|${String(small)}|${String(symbol)}`;
  let f = formats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { ...(symbol ? { style: 'currency', currency, currencyDisplay: 'narrowSymbol' } : {}),
      minimumFractionDigits: 2, maximumFractionDigits: small ? 5 : 2 });
    formats.set(key, f);
  }
  return f;
}

export const formatMoney = (value: number, currency: string): string => formatter(currency, Math.abs(value) > 0 && Math.abs(value) < 10, true).format(value);

/** Signed with a true minus sign, for P&L; no currency symbol. */
export const formatPnl = (value: number, currency = 'INR'): string =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatter(currency, false, false).format(Math.abs(value))}`;

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
  if (order.status === 'filled' && order.fillPrice !== null) return `${what} filled at ${formatMoney(order.fillPrice, order.currency)}.`;
  return `${what} is ${order.status}.`;
}
