import { ApiError } from '../../shared/api/api-error';
import { Button } from '../../shared/ui/button';
import { describeOrder } from './paper-format';
import { useOrderTicket, type TicketValues } from './use-paper';

const field = 'rounded-md border bg-background px-2 py-1 text-sm';

/** A compact paper order ticket for the chart's symbol: market or limit, MIS or CNC. */
export function OrderTicket({ symbol, initialSide = 'buy' }: { symbol: string; initialSide?: TicketValues['side'] }) {
  const { values, update, submit, place } = useOrderTicket(symbol, initialSide);
  const result = place.data?.order;
  return <form aria-label="Paper order" className="space-y-2" onSubmit={event => { event.preventDefault(); submit(); }}>
    <div className="flex gap-1">
      {(['buy', 'sell'] as const).map(side => <Button key={side} type="button" size="xs" variant={values.side === side ? 'default' : 'outline'}
        aria-pressed={values.side === side} onClick={() => { update({ side }); }}>{side === 'buy' ? 'Buy' : 'Sell'}</Button>)}
      <span className="ml-auto truncate text-xs text-muted-foreground">{symbol}</span>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <label className="grid gap-1 text-xs">Type
        <select className={field} value={values.type} onChange={event => { update({ type: event.target.value === 'limit' ? 'limit' : 'market' }); }}>
          <option value="market">Market</option><option value="limit">Limit</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs">Product
        <select className={field} value={values.product} onChange={event => { update({ product: productOf(event.target.value) }); }}>
          <option value="MIS">Intraday (MIS)</option><option value="CNC">Delivery (CNC)</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs">Quantity
        <input className={field} inputMode="numeric" value={values.quantity} onChange={event => { update({ quantity: event.target.value }); }} />
      </label>
      {values.type === 'limit' && <label className="grid gap-1 text-xs">Limit price
        <input className={field} inputMode="decimal" value={values.limitPrice} onChange={event => { update({ limitPrice: event.target.value }); }} />
      </label>}
    </div>
    <Button type="submit" size="sm" className="w-full" disabled={place.isPending}>{place.isPending ? 'Placing…' : `Place paper ${values.side}`}</Button>
    {place.isError && <p role="alert" className="text-xs text-down">{place.error instanceof ApiError ? place.error.message : 'Order not placed'}</p>}
    {result && <p role="status" className={`text-xs ${result.status === 'rejected' ? 'text-down' : 'text-muted-foreground'}`}>{describeOrder(result)}</p>}
  </form>;
}

function productOf(value: string): TicketValues['product'] { return value === 'CNC' ? 'CNC' : 'MIS'; }
