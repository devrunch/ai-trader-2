import { PanelState, relative } from './panel-states';
import { useDataGaps } from './use-admin';

const table = 'w-full text-left text-sm [&_td]:py-1.5 [&_td]:pr-3 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-3 [&_th]:font-medium [&_th]:text-muted-foreground';

/** What the assistant looked for and could not get. Users are never told; this is the list of sources and keys to add. */
export function DataGapsPanel() {
  const gaps = useDataGaps();
  return <PanelState query={gaps} isEmpty={data => data.gaps.length === 0} empty="Nothing yet: every lookup the assistant made found its data.">{data =>
    <div className="overflow-x-auto"><table className={table}>
      <thead><tr><th>Tool</th><th>About</th><th>Why</th><th>Times</th><th>Last seen</th></tr></thead>
      <tbody>{data.gaps.map(g => <tr key={`${g.tool}|${g.subject}|${g.reason}`}>
        <td className="font-medium">{g.tool}</td><td>{g.subject || '—'}</td><td className="max-w-96 text-muted-foreground">{g.reason}</td>
        <td className="num">{g.count}</td><td className="whitespace-nowrap text-muted-foreground">{relative(g.lastSeen)}</td>
      </tr>)}</tbody>
    </table></div>}
  </PanelState>;
}
