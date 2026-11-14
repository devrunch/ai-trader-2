import type { AgentAction } from '@aitrader/contracts';

type PlaceOrder = Extract<AgentAction, { kind: 'place-order' }>;

export const describeOrder = (a: PlaceOrder): string =>
  `Place PAPER order: ${a.side.toUpperCase()} ${String(a.quantity)} ${a.symbol} @ ${a.type === 'limit' && a.limitPrice !== undefined ? String(a.limitPrice) : 'market'}, stop ${String(a.stopLoss)}${a.target === undefined ? '' : `, target ${String(a.target)}`}`;

/** The order is read-only: the server places it on Apply, after the risk check runs again. */
export function OrderSummary({ action }: { action: PlaceOrder }) {
  return <div className="space-y-0.5">
    <span className="rounded border px-1 text-[11px] uppercase text-muted-foreground">PAPER</span>
    <p>{action.rationale}</p>
  </div>;
}
