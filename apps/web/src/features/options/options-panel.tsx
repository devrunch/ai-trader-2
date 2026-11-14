import { useState } from 'react';
import type { OptionChain, OptionsSummary } from '@aitrader/contracts';
import { ApiError } from '../../shared/api';
import { Skeleton } from '../../shared/ui/skeleton';
import { ChainTable } from './chain-table';
import { underlyingOf, useOptionChain, useOptionsSummary } from './use-options';

const Empty = ({ children }: { children: string }) => <p className="p-3 text-sm text-muted-foreground">{children}</p>;

function Summary({ summary }: { summary: OptionsSummary }) {
  const stats: Array<[string, string]> = [['PCR', summary.pcr === null ? '–' : summary.pcr.toFixed(2)], ['Max pain', summary.maxPain === null ? '–' : String(summary.maxPain)],
    ['Call OI', summary.totalCeOi.toLocaleString('en-IN')], ['Put OI', summary.totalPeOi.toLocaleString('en-IN')]];
  return <div>
    <dl className="grid grid-cols-4 gap-1 px-2 py-1 text-xs">{stats.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl>
    {summary.buildups.length > 0 && <div className="px-2 pb-1 text-xs"><p className="text-muted-foreground">Largest build-ups</p>
      <ul aria-label="Build-ups">{summary.buildups.map(b => <li key={`${String(b.strike)}${b.type}`} className="flex justify-between tabular-nums">
        <span className={b.type === 'CE' ? 'text-down' : 'text-up'}>{b.strike} {b.type}</span><span>+{b.oiChange.toLocaleString('en-IN')}</span></li>)}</ul></div>}
  </div>;
}

function Loaded({ chain, expiry, onExpiry, summary }: { chain: OptionChain; expiry: string; onExpiry: (value: string) => void; summary: OptionsSummary | undefined }) {
  return <div>
    <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs">
      <span>{chain.underlying}{chain.spot === null ? '' : ` ${chain.spot.toLocaleString('en-IN')}`}</span>
      <select aria-label="Expiry" value={expiry} onChange={e => { onExpiry(e.target.value); }} className="border bg-panel px-1 py-0.5">
        {chain.expiries.map(e => <option key={e} value={e}>{e}</option>)}</select>
    </div>
    {summary && <Summary summary={summary} />}
    {chain.rows.length === 0 ? <Empty>No strikes returned for this expiry</Empty> : <div className="overflow-x-auto"><ChainTable chain={chain} /></div>}
  </div>;
}

/** The option chain for an NSE F&O underlying: open interest, IV, PCR, max pain and build-ups, refreshed every 30 s. */
export function OptionsPanel({ symbol }: { symbol: string }) {
  const underlying = underlyingOf(symbol);
  const [picked, setPicked] = useState<{ underlying: string | null; expiry: string }>();
  const expiry = picked?.underlying === underlying ? picked.expiry : undefined;
  const chain = useOptionChain(underlying, expiry);
  const summary = useOptionsSummary(underlying, chain.data?.expiry);
  if (underlying === null) return <Empty>No options for this symbol</Empty>;
  if (chain.isError && chain.error instanceof ApiError && chain.error.status === 404) return <Empty>No options for this symbol</Empty>;
  if (chain.isPending) return <div aria-label="Loading option chain" className="space-y-1 p-2"><Skeleton className="h-4" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  if (!chain.data) return <p className="p-3 text-sm text-muted-foreground">Could not load the option chain. <button type="button" className="text-link underline" onClick={() => { void chain.refetch(); }}>Retry</button></p>;
  return <Loaded chain={chain.data} expiry={chain.data.expiry} summary={summary.data} onExpiry={value => { setPicked({ underlying, expiry: value }); }} />;
}
