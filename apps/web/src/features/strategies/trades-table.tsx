import type { BacktestResult } from '@aitrader/contracts';

const when = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const MAX_ROWS = 100;
const tone = (v: number): string => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-muted-foreground');

export function TradesTable({ trades }: { trades: BacktestResult['trades'] }) {
  if (trades.length === 0) return <p className="text-muted-foreground">No trades: the entry rule never fired on this sample.</p>;
  const rows = [...trades].reverse().slice(0, MAX_ROWS);
  return <div>
    <table aria-label="Trades" className="w-full text-left">
      <thead className="text-xs text-muted-foreground"><tr><th>Entry</th><th>Exit</th><th>Entry price</th><th>Exit price</th><th>P&amp;L</th><th>Exit reason</th></tr></thead>
      <tbody>{rows.map(t => <tr key={`${String(t.entryTime)}-${String(t.exitTime)}`} className="border-t">
        <td>{when.format(t.entryTime)}</td><td>{when.format(t.exitTime)}</td>
        <td className="num">{t.entryPrice.toFixed(2)}</td><td className="num">{t.exitPrice.toFixed(2)}</td>
        <td className={`num ${tone(t.pnl)}`}>{t.pnl.toFixed(2)}</td><td>{t.exitReason}</td></tr>)}</tbody>
    </table>
    {trades.length > MAX_ROWS && <p className="mt-1 text-xs text-muted-foreground">Showing the newest {MAX_ROWS} of {trades.length} trades.</p>}
  </div>;
}
