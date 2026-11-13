import { useQuery } from '@tanstack/react-query';
import { EventScorecardSchema, type EventScorecard } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { Skeleton } from '../../shared/ui/skeleton';
import { moveText, shortSymbol, signed, surpriseTone, TONE_CLASS } from './event-format';

const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: '2-digit' });
const dash = (v: string | null): string => v ?? '—';
const pctOrDash = (v: number | null): string => v === null ? '—' : `${signed(v)}%`;

/** Past releases of one event: forecast, actual, surprise and the 15-minute move per instrument, then the per-instrument stats. */
export function ScorecardPanel({ title, country }: { title: string; country: string }) {
  const card = useQuery({ queryKey: ['calendar', 'scorecard', title, country], staleTime: 300_000,
    queryFn: ({ signal }) => apiFetch(`v1/calendar/scorecard?title=${encodeURIComponent(title)}&country=${country}&limit=8`, { schema: EventScorecardSchema, signal }) });
  return <div aria-label={`${title} scorecard`} className="mt-2 border bg-background p-2 text-[12px]">
    {card.isPending ? <Skeleton className="h-16" />
      : card.isError ? <p role="alert" className="text-down">Scorecard unavailable. <Button variant="link" size="xs" onClick={() => { void card.refetch(); }}>Retry</Button></p>
      : card.data.releases.length === 0 ? <p className="text-muted-foreground">No past releases of this event are stored yet.</p>
      : <Body card={card.data} />}
  </div>;
}

function Body({ card }: { card: EventScorecard }) {
  const symbols = [...new Set(card.releases.flatMap(r => r.reactions.map(x => x.symbol)))];
  return <div className="space-y-2">
    <div className="overflow-x-auto"><table className="w-full text-left">
      <thead className="text-muted-foreground"><tr><th className="pr-2 font-normal">Date</th><th className="pr-2 font-normal">Forecast</th><th className="pr-2 font-normal">Actual</th><th className="pr-2 font-normal">Surprise</th>
        {symbols.map(s => <th key={s} className="pr-2 font-normal">{shortSymbol(s)} 15m</th>)}</tr></thead>
      <tbody>{card.releases.map(r => <tr key={r.eventId} className="num">
        <td className="pr-2">{day.format(Date.parse(r.at))}</td><td className="pr-2">{dash(r.forecast)}</td><td className="pr-2">{dash(r.actual)}</td>
        <td className={`pr-2 ${TONE_CLASS[surpriseTone(r.surprise, card.spec?.beat)]}`}>{r.surprise === null ? '—' : signed(r.surprise)}</td>
        {symbols.map(s => <td key={s} className="pr-2">{moveText(r.reactions.find(x => x.symbol === s)?.move15Pct ?? null)}</td>)}
      </tr>)}</tbody>
    </table></div>
    {card.stats.length === 0 ? <p className="text-muted-foreground">No instrument moves recorded yet.</p>
      : <ul aria-label="Scorecard stats">{card.stats.map(s => <li key={s.symbol}>
        <span className="font-semibold">{shortSymbol(s.symbol)}</span> over {s.n} releases: average 15m move {s.avgAbsMove15Pct === null ? '—' : `±${s.avgAbsMove15Pct.toFixed(2)}%`};
        after a beat {pctOrDash(s.avgMove15WhenBeatPct)}, after a miss {pctOrDash(s.avgMove15WhenMissPct)}; followed the surprise {s.followedSurprisePct === null ? '—' : `${s.followedSurprisePct.toFixed(0)}%`}.
      </li>)}</ul>}
  </div>;
}
