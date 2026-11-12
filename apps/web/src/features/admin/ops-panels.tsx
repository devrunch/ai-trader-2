import type { OpsFeeds } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { Badge, PanelState, formatIst, relative } from './panel-states';
import { useAgentQueue, useFeeds, useInstrumentSources, useJobs, useRefreshInstruments, useRunJob } from './use-admin';

const stateTone = { live: 'up', stale: 'down', stopped: 'down', reconnecting: 'warning', connecting: 'warning', unknown: 'muted' } as const;
const outcomeTone = { ok: 'up', failed: 'down', skipped: 'warning' } as const;
const table = 'w-full text-left text-sm [&_td]:py-1.5 [&_td]:pr-4 [&_th]:pb-2 [&_th]:pr-4 [&_th]:font-medium [&_th]:text-muted-foreground';

export function FeedsPanel() {
  const feeds = useFeeds();
  return <PanelState query={feeds}>{data => <FeedsView feeds={data} />}</PanelState>;
}

function FeedsView({ feeds }: { feeds: OpsFeeds }) {
  return <div className="space-y-5">
    <p className="text-sm"><span className="text-muted-foreground">Leader: </span>
      {feeds.leader ? <><span className="font-mono">{feeds.leader.instanceId}</span><span className="text-muted-foreground"> · lease {Math.round(feeds.leader.ttlMs / 1000)} s</span></> : <Badge tone="down">No leader</Badge>}
    </p>
    <table className={table}>
      <thead><tr><th>Vendor</th><th>State</th><th>Reason</th><th>Since</th></tr></thead>
      <tbody>{feeds.vendors.map(vendor => <tr key={vendor.vendor}>
        <td className="font-medium">{vendor.vendor}</td>
        <td><Badge tone={stateTone[vendor.state]}>{vendor.state}</Badge></td>
        <td className="text-muted-foreground">{[vendor.reason, vendor.detail].filter(Boolean).join(' · ') || '—'}</td>
        <td className="text-muted-foreground">{vendor.at === undefined ? '—' : relative(new Date(vendor.at).toISOString())}</td>
      </tr>)}</tbody>
    </table>
    <div>
      <h3 className="mb-2 text-sm font-medium">Live subscriptions</h3>
      {feeds.subscriptions.length === 0
        ? <p className="text-sm text-muted-foreground">No instrument is being streamed.</p>
        : <ul className="flex flex-wrap gap-2 text-sm">{feeds.subscriptions.map(sub => <li key={sub.instrumentId} className="rounded border px-2 py-0.5">
          <span className="font-mono">{sub.instrumentId}</span><span className="text-muted-foreground"> ×{sub.count}</span></li>)}</ul>}
    </div>
  </div>;
}

/** The assistant's background run queue: runs waiting, running now, and runs that failed for good in the last day. */
function AgentQueueCard() {
  const queue = useAgentQueue();
  return <section aria-label="Assistant run queue" className="mb-4 rounded border p-3">
    <h3 className="mb-2 text-sm font-medium">Assistant run queue</h3>
    <PanelState query={queue}>{q => <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
      <div><dt className="text-muted-foreground">Waiting</dt><dd className="num">{q.depth}</dd></div>
      <div><dt className="text-muted-foreground">Running (of {q.concurrency})</dt><dd className="num">{q.running}</dd></div>
      <div><dt className="text-muted-foreground">Failed, last 24 h</dt><dd className={`num ${q.failed24h > 0 ? 'text-down' : ''}`}>{q.failed24h}</dd></div>
    </dl>}</PanelState>
  </section>;
}

export function JobsPanel() {
  const jobs = useJobs();
  const run = useRunJob();
  return <><AgentQueueCard /><PanelState query={jobs} isEmpty={data => data.length === 0} empty="No jobs are registered in this API instance.">{data =>
    <table className={table}>
      <thead><tr><th>Job</th><th>Last run</th><th>Outcome</th><th>Next run</th><th /></tr></thead>
      <tbody>{data.map(job => {
        const running = run.isPending && run.variables === job.name;
        return <tr key={job.name}>
          <td className="font-mono">{job.name}</td>
          <td className="text-muted-foreground">{job.lastRun ? relative(job.lastRun.at) : 'never'}</td>
          <td>{job.lastRun ? <Badge tone={outcomeTone[job.lastRun.outcome]}>{job.lastRun.outcome}</Badge> : '—'}</td>
          <td className="text-muted-foreground">{job.next ? formatIst(job.next) : '—'}</td>
          <td><Button size="xs" variant="outline" disabled={running} aria-label={`Run ${job.name} now`}
            onClick={() => { run.mutate(job.name); }}>{running ? 'Running…' : 'Run now'}</Button></td>
        </tr>;
      })}</tbody>
    </table>}
  </PanelState></>;
}

export function InstrumentsPanel() {
  const sources = useInstrumentSources();
  const refresh = useRefreshInstruments();
  return <div className="space-y-4">
    <PanelState query={sources} isEmpty={data => data.sources.length === 0} empty="No instrument source has run yet.">{data => <>
      <p className="text-sm"><span className="text-muted-foreground">Total instruments: </span>{data.total.toLocaleString('en-IN')}</p>
      <table className={table}>
        <thead><tr><th>Source</th><th>Status</th><th>Instruments</th><th>Last success</th></tr></thead>
        <tbody>{data.sources.map(source => <tr key={source.source}>
          <td className="font-medium">{source.source}</td>
          <td><Badge tone={source.status === 'ok' ? 'up' : 'down'}>{source.status}</Badge>{source.reason && <span className="ml-2 text-muted-foreground">{source.reason}</span>}</td>
          <td>{source.count.toLocaleString('en-IN')}</td>
          <td className="text-muted-foreground">{source.lastSuccessAt ? relative(source.lastSuccessAt) : 'never'}</td>
        </tr>)}</tbody>
      </table>
    </>}</PanelState>
    <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => { refresh.mutate(); }}>{refresh.isPending ? 'Refreshing…' : 'Refresh now'}</Button>
    {refresh.isSuccess && <p role="status" className="text-sm text-muted-foreground">Refresh started; it runs in the background.</p>}
  </div>;
}
