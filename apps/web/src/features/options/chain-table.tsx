import type { OptionChain } from '@aitrader/contracts';

type Leg = NonNullable<OptionChain['rows'][number]['ce']>;
const num = (value: number | null, digits = 0) => value === null ? '–' : value.toLocaleString('en-IN', { maximumFractionDigits: digits });
const signed = (value: number | null) => value === null ? '–' : `${value > 0 ? '+' : ''}${value.toLocaleString('en-IN')}`;

function Cells({ leg, max, side }: { leg: Leg | null; max: number; side: 'ce' | 'pe' }) {
  const width = leg?.oi != null && max > 0 ? Math.round((leg.oi / max) * 100) : 0;
  const change = leg?.oiChange ?? null;
  const oi = <td key="oi" className="relative px-1 text-right">
    <span aria-hidden data-testid="oi-bar" style={{ width: `${String(width)}%` }} className={`absolute inset-y-0 opacity-20 ${side === 'ce' ? 'right-0 bg-down' : 'left-0 bg-up'}`} />
    <span className="relative">{num(leg?.oi ?? null)}</span></td>;
  const delta = <td key="chg" className={`px-1 text-right ${change === null ? '' : change > 0 ? 'text-up' : change < 0 ? 'text-down' : ''}`}>{signed(change)}</td>;
  const iv = <td key="iv" className="px-1 text-right">{num(leg?.iv ?? null, 1)}</td>;
  const ltp = <td key="ltp" className="px-1 text-right">{num(leg?.ltp ?? null, 2)}</td>;
  return <>{side === 'ce' ? [oi, delta, iv, ltp] : [ltp, iv, delta, oi]}</>;
}

/** Calls on the left, puts on the right, the strike nearest spot highlighted; bars scale to the largest open interest shown. */
export function ChainTable({ chain }: { chain: OptionChain }) {
  const max = Math.max(0, ...chain.rows.flatMap(r => [r.ce?.oi ?? 0, r.pe?.oi ?? 0]));
  return <table className="w-full text-[11px] tabular-nums">
    <thead className="text-muted-foreground"><tr>
      <th colSpan={4} className="px-1 text-center font-normal">Calls</th><th className="px-1 font-normal">Strike</th><th colSpan={4} className="px-1 text-center font-normal">Puts</th></tr>
    <tr>{['OI', 'OI chg', 'IV', 'LTP'].map(h => <th key={`c${h}`} className="px-1 text-right font-normal">{h}</th>)}<th />
      {['LTP', 'IV', 'OI chg', 'OI'].map(h => <th key={`p${h}`} className="px-1 text-right font-normal">{h}</th>)}</tr></thead>
    <tbody>{chain.rows.map(row => <tr key={row.strike} data-atm={row.strike === chain.atm} className={`border-t ${row.strike === chain.atm ? 'bg-muted font-semibold' : ''}`}>
      <Cells leg={row.ce} max={max} side="ce" /><th scope="row" className="px-1 text-center">{row.strike}</th><Cells leg={row.pe} max={max} side="pe" /></tr>)}</tbody>
  </table>;
}
