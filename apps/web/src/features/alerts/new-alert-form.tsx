import { useState, type SyntheticEvent } from 'react';
import type { AlertCreate, Interval } from '@aitrader/contracts';
import { ApiError } from '../../shared/api/api-error';
import { Button } from '../../shared/ui/button';
import { useIndicatorCatalog } from '../indicators';
import { EventAlertFields, NewsAlertFields } from './watch-alert-fields';

type Kind = 'price' | 'news' | 'event';
const KINDS: Array<{ id: Kind; name: string }> = [{ id: 'price', name: 'Price / indicators' }, { id: 'news', name: 'News' }, { id: 'event', name: 'Event' }];

export function NewAlert({ symbol, interval, pending, error, last, onCreate }: { symbol: string; interval: Interval; pending: boolean; error: unknown; last: number | null;
  onCreate: (body: AlertCreate) => void }) {
  const [kind, setKind] = useState<Kind>('price');
  return <div className="space-y-1.5 border-b px-3 py-2">
    <select aria-label="Alert type" className="h-6 border bg-panel px-1" value={kind} onChange={e => { setKind(KINDS.find(k => k.id === e.target.value)?.id ?? 'price'); }}>
      {KINDS.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
    </select>
    {kind === 'price' ? <PriceAlertForm symbol={symbol} interval={interval} pending={pending} onCreate={onCreate} />
      : kind === 'news' ? <NewsAlertFields pending={pending} onCreate={onCreate} />
      : <EventAlertFields pending={pending} onCreate={onCreate} />}
    {error !== null && error !== undefined && <p role="alert" className="text-down">{error instanceof ApiError ? error.message : 'Alert not saved'}</p>}
    {last !== null && <p className="text-muted-foreground">Saved. Last price {last}.</p>}
  </div>;
}

function PriceAlertForm({ symbol, interval, pending, onCreate }: { symbol: string; interval: Interval; pending: boolean; onCreate: (body: AlertCreate) => void }) {
  const catalog = useIndicatorCatalog();
  // '' is the price; otherwise a built-in's id, with one of its plots.
  const [on, setOn] = useState('');
  const [plot, setPlot] = useState('');
  const definition = catalog.data?.find(d => d.id === on);
  const plots = definition?.plots ?? [];
  const [op, setOp] = useState<'above' | 'below'>('above');
  const [value, setValue] = useState('');
  const [repeat, setRepeat] = useState(false);
  const level = Number(value);
  // Indicator values can be zero or negative (MACD, CCI); prices cannot.
  const valid = value.trim() !== '' && Number.isFinite(level) && (on !== '' || level > 0);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid) return;
    const chosen = plots.find(p => p.id === plot) ?? plots[0];
    onCreate({ trigger: on === '' ? { kind: 'price', symbol, op, value: level }
      : { kind: 'indicator', symbol, interval, indicatorId: on, inputs: {}, ...(plots.length > 1 && chosen ? { plot: chosen.id } : {}), op, value: level }, repeat });
    setValue('');
  };
  return <form aria-label="New alert" onSubmit={submit} className="space-y-1.5">
    <div className="flex items-center gap-1.5">
      <span className="min-w-0 truncate font-semibold">{symbol}</span>
      <select aria-label="Condition" className="h-6 max-w-28 border bg-panel px-1" value={on} onChange={e => { setOn(e.target.value); setPlot(''); }}>
        <option value="">Price</option>
        {(catalog.data ?? []).map(d => <option key={d.id} value={d.id}>{d.shortName} ({interval})</option>)}
      </select>
      {plots.length > 1 && <select aria-label="Plot" className="h-6 max-w-24 border bg-panel px-1" value={plot || plots[0]?.id} onChange={e => { setPlot(e.target.value); }}>
        {plots.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>}
      <select aria-label="Direction" className="h-6 border bg-panel px-1" value={op} onChange={e => { setOp(e.target.value === 'below' ? 'below' : 'above'); }}>
        <option value="above">crosses above</option><option value="below">crosses below</option>
      </select>
      <input aria-label="Level" inputMode="decimal" className="num h-6 w-24 border bg-panel px-1" placeholder={on === '' ? 'price' : 'value'} value={value} onChange={e => { setValue(e.target.value); }} />
      <Button size="xs" type="submit" disabled={!valid || pending}>Add</Button>
    </div>
    <label className="flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" checked={repeat} onChange={e => { setRepeat(e.target.checked); }} />Every crossing (30 days)</label>
  </form>;
}
