import { useState } from 'react';
import { fieldClass } from '../../shared/ui/page';
import { Badge, PanelState, relative } from './panel-states';
import { useRecentLogs } from './use-admin';

/** The newest warning and error lines of the API processes, with a text filter. */
export function LogsPanel() {
  const [filter, setFilter] = useState('');
  const logs = useRecentLogs(filter.trim());
  return <div className="space-y-3">
    <input aria-label="Filter" placeholder="Filter (job name, symbol, error text)" className={fieldClass} value={filter} onChange={e => { setFilter(e.target.value); }} />
    <PanelState query={logs} isEmpty={data => data.logs.length === 0} empty="No warnings or errors recorded.">{data =>
      <ul className="divide-y text-sm">{data.logs.map((l, i) => <li key={i} className="py-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge tone={l.level === 'warn' ? 'muted' : 'down'}>{l.level}</Badge><span>{l.service}</span><span>{l.time ? relative(l.time) : ''}</span></div>
        <p className="break-words">{l.msg}</p>
        {Object.keys(l.context).length > 0 && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(l.context)}</pre>}
      </li>)}</ul>}
    </PanelState>
  </div>;
}
