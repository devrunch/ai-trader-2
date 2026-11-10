import type { PaperOrderType, PaperSide } from '@aitrader/contracts';
import { roundToTick } from './money';

/** One-minute bars from market data; `time` is the bar start. */
export interface PriceBar { time: number; open: number; high: number; low: number; close: number }

export interface WorkingOrder {
  side: PaperSide;
  type: PaperOrderType;
  limitPrice: number | null;
  triggerPrice: number | null;
  triggered: boolean;
  placedAt: number;
  tick: number;
  /** Adverse slippage applied to market-style fills (market, stop and a triggered stop-limit). */
  slippageRate: number;
}

export type MatchResult = { kind: 'fill'; price: number; slippage: number; at: number } | { kind: 'none'; triggered: boolean };

const BAR_MS = 60_000;

/**
 * Walks the bars in time order and returns the first fill. Within the bar the order was placed in, only the close
 * is known to come after placement, so that bar counts as a single price; a market order waits for the next bar's open.
 */
export function matchOrder(order: WorkingOrder, bars: readonly PriceBar[]): MatchResult {
  let triggered = order.triggered;
  for (const bar of bars) {
    if (bar.time + BAR_MS <= order.placedAt) continue;
    const placementBar = bar.time <= order.placedAt;
    if (placementBar && order.type === 'market') continue;
    const result = evaluate({ ...order, triggered }, placementBar ? point(bar.close) : bar, Math.max(bar.time, order.placedAt));
    if (result.kind === 'fill') return result;
    triggered = result.triggered;
  }
  return { kind: 'none', triggered };
}

/** Evaluates against one live price, as at placement with a fresh quote. */
export function matchAtPrice(order: WorkingOrder, price: number, at: number): MatchResult {
  return evaluate(order, point(price), at);
}

export function slipped(side: PaperSide, price: number, rate: number, tick: number): number {
  return side === 'buy' ? roundToTick(price * (1 + rate), tick, 'up') : roundToTick(price * (1 - rate), tick, 'down');
}

function evaluate(order: WorkingOrder, bar: Omit<PriceBar, 'time'>, at: number): MatchResult {
  if (order.type === 'market') return marketFill(order, bar.open, at);
  if (order.type === 'limit' || (order.type === 'stop_limit' && order.triggered)) return limitFill(order, bar, at) ?? { kind: 'none', triggered: order.triggered };
  const stop = required(order.triggerPrice);
  const buy = order.side === 'buy';
  // A stop the price opens beyond triggers at the open: the next price, not the stop.
  const triggerAt = buy ? (bar.open >= stop ? bar.open : bar.high >= stop ? stop : null)
    : (bar.open <= stop ? bar.open : bar.low <= stop ? stop : null);
  if (triggerAt === null) return { kind: 'none', triggered: false };
  if (order.type === 'stop') return marketFill(order, triggerAt, at);
  const limit = required(order.limitPrice);
  if (buy ? triggerAt > limit : triggerAt < limit) return { kind: 'none', triggered: true };
  const price = buy ? Math.min(slipped('buy', triggerAt, order.slippageRate, order.tick), limit)
    : Math.max(slipped('sell', triggerAt, order.slippageRate, order.tick), limit);
  return { kind: 'fill', price, slippage: difference(price, triggerAt), at };
}

function limitFill(order: WorkingOrder, bar: Omit<PriceBar, 'time'>, at: number): MatchResult | null {
  const limit = required(order.limitPrice);
  const price = order.side === 'buy' ? (bar.open <= limit ? bar.open : bar.low <= limit ? limit : null)
    : (bar.open >= limit ? bar.open : bar.high >= limit ? limit : null);
  return price === null ? null : { kind: 'fill', price, slippage: 0, at };
}

function marketFill(order: WorkingOrder, base: number, at: number): MatchResult {
  const price = slipped(order.side, base, order.slippageRate, order.tick);
  return { kind: 'fill', price, slippage: difference(price, base), at };
}

function point(price: number): Omit<PriceBar, 'time'> { return { open: price, high: price, low: price, close: price }; }
function difference(a: number, b: number): number { return Math.round(Math.abs(a - b) * 10_000) / 10_000; }

function required(value: number | null): number {
  if (value === null) throw new Error('Order is missing a price its type requires');
  return value;
}
