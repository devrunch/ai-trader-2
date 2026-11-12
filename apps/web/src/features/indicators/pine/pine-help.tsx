import { useMemo, useState } from 'react';
import { PINE_COVERAGE, type PineCoverageRow } from '@aitrader/contracts';

/** Help tab: what the Pine runtime runs and what it refuses (FR-IN-26), from the generated report. */
export function PineHelp({ rows = PINE_COVERAGE }: { rows?: readonly PineCoverageRow[] }) {
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const shown = rows.filter(row => `${row.group} ${row.feature} ${row.note}`.toLowerCase().includes(needle));
    const grouped = new Map<string, PineCoverageRow[]>();
    for (const row of shown) grouped.set(row.group, [...(grouped.get(row.group) ?? []), row]);
    return grouped;
  }, [rows, filter]);
  if (rows.length === 0) return <p className="text-[12px] text-muted-foreground">The coverage report is empty, so no Pine features are listed yet.</p>;
  return <div className="space-y-2">
    <input aria-label="Filter coverage" placeholder="Filter features" value={filter} onChange={e => { setFilter(e.target.value); }}
      className="h-8 w-full rounded border border-input bg-background px-2 text-[12px]" />
    {groups.size === 0 && <p className="text-[12px] text-muted-foreground">No feature matches the filter.</p>}
    <div className="max-h-[50vh] overflow-auto text-[12px]">{[...groups].map(([group, items]) => <section key={group} aria-label={group} className="mb-2">
      <h3 className="sticky top-0 bg-popover py-0.5 font-semibold">{group}</h3>
      <ul>{items.map(row => <li key={row.feature} className="flex gap-2 py-0.5">
        <code className="flex-1">{row.feature}</code>
        <span className={row.status === 'supported' ? 'text-up' : 'text-destructive'}>{row.status}</span>
        {row.note && <span className="max-w-[45%] text-muted-foreground">{row.note}</span>}
      </li>)}</ul>
    </section>)}</div>
  </div>;
}
