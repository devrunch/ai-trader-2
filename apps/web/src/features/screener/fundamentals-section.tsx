import { FUNDAMENTAL_FIELDS } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { FUNDAMENTAL_LABELS, FUNDAMENTAL_OP_LABELS, type FormFundamental, type FundamentalOp } from './screener-builder';

const box = 'h-7 min-w-0 rounded border bg-background px-1.5';
const OPS = Object.keys(FUNDAMENTAL_OP_LABELS).flatMap((k): FundamentalOp[] => (k === 'gt' || k === 'gte' || k === 'lt' || k === 'lte' ? [k] : []));

export function FundamentalsSection({ rows, onChange }: { rows: FormFundamental[]; onChange: (rows: FormFundamental[]) => void }) {
  const set = (i: number, patch: Partial<FormFundamental>) => { onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))); };
  return <fieldset className="space-y-1"><legend className="mb-1 font-semibold">Fundamentals</legend>
    <p className="text-muted-foreground">Filters apply to NSE stocks. Stocks without cached fundamentals are listed as skipped.</p>
    {rows.map((r, i) => <div key={i} className="flex flex-wrap items-center gap-1">
      <select aria-label={`Filter ${String(i + 1)} field`} className={box} value={r.field} onChange={e => { set(i, { field: FUNDAMENTAL_FIELDS.find(f => f === e.target.value) ?? r.field }); }}>
        {FUNDAMENTAL_FIELDS.map(f => <option key={f} value={f}>{FUNDAMENTAL_LABELS[f].label}</option>)}</select>
      <select aria-label={`Filter ${String(i + 1)} operator`} className={box} value={r.op} onChange={e => { set(i, { op: OPS.find(o => o === e.target.value) ?? r.op }); }}>
        {OPS.map(o => <option key={o} value={o}>{FUNDAMENTAL_OP_LABELS[o]}</option>)}</select>
      <input aria-label={`Filter ${String(i + 1)} value`} inputMode="decimal" className={`${box} w-24`} value={r.value} onChange={e => { set(i, { value: e.target.value }); }} />
      <span className="text-muted-foreground">{FUNDAMENTAL_LABELS[r.field].unit}</span>
      <Button type="button" size="xs" variant="ghost" aria-label={`Remove filter ${String(i + 1)}`} onClick={() => { onChange(rows.filter((_, j) => j !== i)); }}>×</Button>
    </div>)}
    <Button type="button" size="xs" variant="outline" onClick={() => { onChange([...rows, { field: 'pe', op: 'lt', value: '' }]); }}>Add filter</Button>
  </fieldset>;
}
