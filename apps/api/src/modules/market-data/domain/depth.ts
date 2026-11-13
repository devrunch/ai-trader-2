import type { Depth, DepthLevel } from '@aitrader/contracts';

interface DepthInput { instrumentId: string; at: number; source: string; levels: '5' | '1'; bids: readonly DepthLevel[]; asks: readonly DepthLevel[] }
const round = (value: number): number => Math.round(value * 1e8) / 1e8;

/** Levels with no price are empty slots in the exchange packet; the rest keep their best-first order. */
const filled = (levels: readonly DepthLevel[]): DepthLevel[] => levels.filter(level => level.price > 0).slice(0, 5);

/** Spread is best ask minus best bid; its percentage is of the mid price. Imbalance is (bid - ask) / (bid + ask) over the shown quantities. */
export function buildDepth(input: DepthInput): Depth {
  const bids = filled(input.bids); const asks = filled(input.asks);
  const bestBid = bids[0]?.price; const bestAsk = asks[0]?.price;
  const spread = bestBid === undefined || bestAsk === undefined ? null : round(bestAsk - bestBid);
  const mid = bestBid === undefined || bestAsk === undefined ? 0 : (bestBid + bestAsk) / 2;
  const totalBidQty = bids.reduce((sum, level) => sum + level.quantity, 0);
  const totalAskQty = asks.reduce((sum, level) => sum + level.quantity, 0);
  const total = totalBidQty + totalAskQty;
  return { instrumentId: input.instrumentId, at: input.at, source: input.source, levels: input.levels, bids, asks, spread,
    spreadPct: spread === null || mid === 0 ? null : round((spread / mid) * 100),
    totalBidQty, totalAskQty, imbalance: total === 0 ? null : round((totalBidQty - totalAskQty) / total) };
}
