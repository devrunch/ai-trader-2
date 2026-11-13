import type { DataSourceDto } from '@aitrader/contracts';
import { Badge, PanelState, relative } from './panel-states';
import { useDataSources } from './use-admin';

const table = 'w-full text-left text-sm [&_td]:py-1.5 [&_td]:pr-3 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-3 [&_th]:font-medium [&_th]:text-muted-foreground';

const limitText = ({ requests, windowSec }: DataSourceDto['rateLimit']): string => {
  if (windowSec % 86_400 === 0) return `${String(requests)} / ${windowSec === 86_400 ? 'day' : `${String(windowSec / 86_400)} d`}`;
  if (windowSec % 3600 === 0) return `${String(requests)} / ${windowSec === 3600 ? 'h' : `${String(windowSec / 3600)} h`}`;
  if (windowSec % 60 === 0) return `${String(requests)} / ${windowSec === 60 ? 'min' : `${String(windowSec / 60)} min`}`;
  return `${String(requests)} / ${windowSec === 1 ? 's' : `${String(windowSec)} s`}`;
};

function SourceRow({ source }: { source: DataSourceDto }) {
  return <tr>
    <td><span className="font-medium" title={source.terms}>{source.id}</span><div className="max-w-64 text-xs text-muted-foreground">{source.terms}</div></td>
    <td>{source.owner}</td>
    <td>{source.kind}</td>
    <td className="text-muted-foreground">{source.markets.join(', ') || '—'}</td>
    <td>{source.state === 'enabled' ? <Badge tone="up">enabled</Badge> : <Badge tone="muted">off (no key)</Badge>}
      {source.state === 'off' && <div className="text-xs text-muted-foreground">{source.missingKeys.join(', ')}</div>}</td>
    <td className="text-muted-foreground">{source.lastSuccessAt ? relative(source.lastSuccessAt) : 'never'}</td>
    <td>{source.lastError ? <span className="text-down" title={source.lastErrorAt ?? undefined}>{source.lastError}{source.lastErrorAt && ` · ${relative(source.lastErrorAt)}`}</span> : <span className="text-muted-foreground">—</span>}</td>
    <td className="num">{source.items24h.toLocaleString('en-IN')}</td>
    <td className={`num ${source.rateLimitHits24h > 0 ? 'text-warning' : ''}`}>{source.rateLimitHits24h}</td>
    <td className="whitespace-nowrap text-muted-foreground">{limitText(source.rateLimit)}</td>
  </tr>;
}

/** Every registered data source with its key state and what its calls recorded (docs/DATA-SOURCES.md rule 4). */
export function SourcesPanel() {
  const sources = useDataSources();
  return <PanelState query={sources} isEmpty={data => data.sources.length === 0} empty="No data source is registered in this API instance.">{data =>
    <div className="overflow-x-auto"><table className={table}>
      <thead><tr><th>Source</th><th>Owner</th><th>Kind</th><th>Markets</th><th>State</th><th>Last success</th><th>Last error</th><th>Items 24 h</th><th>Limit hits 24 h</th><th>Limit</th></tr></thead>
      <tbody>{data.sources.map(source => <SourceRow key={source.id} source={source} />)}</tbody>
    </table></div>}
  </PanelState>;
}
