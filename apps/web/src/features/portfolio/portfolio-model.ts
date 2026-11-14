import type { PaperFill, PaperOrder, PaperPosition } from '@aitrader/contracts';

export type Owner = 'ai' | 'you';
/** Orders the assistant places carry an `agent-` id; everything else the user placed (square-offs belong to whoever opened the position). */
export const ownerOf = (clientOrderId: string): Owner | null => (clientOrderId.startsWith('agent-') ? 'ai' : clientOrderId.startsWith('squareoff#') ? null : 'you');

export interface Side { realised: number; closedTrades: number; wins: number; orders: number }

/** Realised profit, closed trades and win rate for the assistant and for the user, from fills matched to their orders. */
export function splitResults(orders: PaperOrder[], fills: PaperFill[]): Record<Owner, Side> {
  const byId = new Map(orders.map(o => [o.id, o]));
  const instrumentOwner = new Map<string, Owner>();
  for (const o of orders) { const w = ownerOf(o.clientOrderId); if (w && o.status === 'filled') instrumentOwner.set(o.instrumentId, w); }
  const out: Record<Owner, Side> = { ai: { realised: 0, closedTrades: 0, wins: 0, orders: 0 }, you: { realised: 0, closedTrades: 0, wins: 0, orders: 0 } };
  for (const o of orders) { const w = ownerOf(o.clientOrderId); if (w && o.parentOrderId === null && o.status === 'filled') out[w].orders++; }
  for (const f of fills) {
    const order = byId.get(f.orderId);
    const w = (order ? ownerOf(order.clientOrderId) : null) ?? instrumentOwner.get(f.instrumentId) ?? 'you';
    if (f.realisedPnl === 0) continue;
    out[w].realised += f.realisedPnl;
    out[w].closedTrades++;
    if (f.realisedPnl > 0) out[w].wins++;
  }
  return out;
}

/** Who holds an open position: the assistant, the user, or both, from the filled orders on that instrument. */
export function positionOwner(position: PaperPosition, orders: PaperOrder[]): 'ai' | 'you' | 'both' {
  const owners = new Set(orders.filter(o => o.instrumentId === position.instrumentId && o.status === 'filled').map(o => ownerOf(o.clientOrderId)).filter((w): w is Owner => w !== null));
  return owners.size === 2 ? 'both' : owners.has('ai') ? 'ai' : 'you';
}
