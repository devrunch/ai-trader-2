import type { ScanResult, ScanRow } from '@aitrader/contracts';
import { Sparkline } from './sparkline';

const ist = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const istDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
/** A daily bar is named by its day's close; intraday bars by their IST time. */
const barText = (ms: number, interval: string): string => (interval === '1D' ? `${istDay.format(ms)} close` : `${ist.format(ms).replace(',', '')} IST`);
const tone = (v: number | null): string => (v === null || v === 0 ? 'text-muted-foreground' : v > 0 ? 'text-up' : 'text-down');
const matched = (values: ScanRow['values']): string => Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${String(Math.round((v ?? 0) * 100) / 100)}`).join(' ');

export function ScanResults({ result, refreshing, onOpen }: { result: ScanResult; refreshing: boolean; onOpen: (symbol: string) => void }) {
  return <section aria-label="Results" className={`space-y-2 text-[12px] ${refreshing ? 'opacity-70' : ''}`}>
    <p className="flex items-center gap-2 font-semibold">
      <span>{`${String(result.matched)} matched of ${String(result.scanned)} scanned on ${result.interval} bars${result.asOfBar === null ? '' : ` as of ${barText(result.asOfBar, result.interval)}`}`}</span>
      {result.cached && <span className="rounded border px-1 text-[11px] font-normal text-muted-foreground" title="Served from a recent identical scan">cached</span>}
    </p>
    {result.rows.length === 0
      ? <p className="text-muted-foreground">{`No matches: ${String(result.scanned)} symbols in ${result.universe} were scanned on ${result.interval} bars.`}</p>
      : <table aria-label="Matches" className="w-full text-left">
        <thead className="text-[11px] text-muted-foreground"><tr><th>Symbol</th><th>Name</th><th>Last</th><th>Change</th><th>Matched values</th><th>Trend</th><th>Bar</th></tr></thead>
        <tbody>{result.rows.map(r => <tr key={r.symbol} className="border-t">
          <td><button type="button" className="font-semibold hover:underline" onClick={() => { onOpen(r.symbol); }}>{r.symbol}</button></td>
          <td className="max-w-40 truncate">{r.name ?? ''}</td>
          <td className="tabular-nums">{r.last}</td>
          <td className={`tabular-nums ${tone(r.changePct)}`}>{r.changePct === null ? '-' : `${r.changePct.toFixed(2)}%`}</td>
          <td className="text-[11px]">{matched(r.values)}</td>
          <td><Sparkline symbol={r.symbol} points={r.spark} /></td>
          <td className="whitespace-nowrap text-[11px] text-muted-foreground">{barText(r.barTime, result.interval)}</td>
        </tr>)}</tbody></table>}
    {result.stale.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">{`Not scanned (${String(result.stale.length)})`}</summary>
      <ul className="mt-1 text-[11px]">{result.stale.map(s => <li key={s.symbol}>{`${s.symbol} - ${s.reason}`}</li>)}</ul></details>}
  </section>;
}
