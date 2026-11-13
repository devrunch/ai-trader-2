import { COMPARE_OPS } from '@aitrader/contracts';
import { Button } from '../ui/button';
import { OP_LABELS, type Combine, type FormCondition } from './condition-text';

export const fieldBox = 'h-7 min-w-0 rounded border bg-background px-1.5';

/** Condition rows `left op right`; operands are typed (bar field, indicator name, number, or `name[n]`). */
export function ConditionRows({ label, rows, mode, options, onRows, onMode }: { label: string; rows: FormCondition[]; mode: Combine; options: string[];
  onRows: (rows: FormCondition[]) => void; onMode: (mode: Combine) => void }) {
  const list = `${label}-options`;
  const set = (i: number, patch: Partial<FormCondition>) => { onRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))); };
  return <fieldset className="space-y-1">
    <legend className="mb-1 flex items-center gap-2 font-semibold">{label}
      {rows.length > 1 && <select aria-label={`${label} combine`} className={fieldBox} value={mode} onChange={e => { onMode(e.target.value === 'any' ? 'any' : 'all'); }}>
        <option value="all">AND</option><option value="any">OR</option></select>}
    </legend>
    <datalist id={list}>{options.map(o => <option key={o} value={o} />)}</datalist>
    {rows.map((r, i) => <div key={i} className="flex flex-wrap items-center gap-1">
      <input aria-label={`${label} ${String(i + 1)} left`} list={list} className={`${fieldBox} w-24`} value={r.left} onChange={e => { set(i, { left: e.target.value }); }} />
      <select aria-label={`${label} ${String(i + 1)} operator`} className={fieldBox} value={r.op} onChange={e => { set(i, { op: COMPARE_OPS.find(o => o === e.target.value) ?? r.op }); }}>
        {COMPARE_OPS.map(o => <option key={o} value={o}>{OP_LABELS[o]}</option>)}</select>
      <input aria-label={`${label} ${String(i + 1)} right`} list={list} className={`${fieldBox} w-24`} value={r.right} onChange={e => { set(i, { right: e.target.value }); }} />
      <Button type="button" size="xs" variant="ghost" aria-label={`Remove ${label} ${String(i + 1)}`} onClick={() => { onRows(rows.filter((_, j) => j !== i)); }}>×</Button>
    </div>)}
    <Button type="button" size="xs" variant="outline" onClick={() => { onRows([...rows, { left: 'close', op: 'gt', right: '0' }]); }}>Add condition</Button>
  </fieldset>;
}
