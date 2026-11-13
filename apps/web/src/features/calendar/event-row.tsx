import { useState } from 'react';
import type { EconomicEvent } from '@aitrader/contracts';
import { reactionLine, shortSymbol, signed, surpriseTone, TONE_CLASS } from './event-format';
import { ScorecardPanel } from './scorecard-panel';

const ist = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const IMPACT_TONE: Record<EconomicEvent['impact'], string> = { High: 'bg-down', Medium: 'bg-[orange]', Low: 'bg-muted-foreground', Holiday: 'bg-muted-foreground' };

/** One release: forecast, previous, actual and surprise; click for what it measures and its scorecard. */
export function EventRow({ event: e }: { event: EconomicEvent }) {
  const [open, setOpen] = useState(false);
  const tone = surpriseTone(e.surprise, e.spec?.beat);
  const lines = (e.reactions ?? []).map(reactionLine).filter((l): l is string => l !== null);
  return <li className="grid grid-cols-[5.5rem_2.75rem_minmax(0,1fr)] items-start gap-2 py-2 sm:grid-cols-[7.5rem_3rem_minmax(0,1fr)]">
    <span className="num text-muted-foreground">{ist.format(Date.parse(e.at))}</span>
    <span className="flex items-center gap-1 font-semibold"><span aria-label={`${e.impact} impact`} className={`inline-block size-2 rounded-full ${IMPACT_TONE[e.impact]}`} />{e.country}</span>
    <span className="min-w-0">
      <button type="button" aria-expanded={open} aria-label={`${e.title} details`} onClick={() => { setOpen(o => !o); }} className="text-left font-medium hover:underline">{e.title}</button>
      {(e.forecast ?? e.previous ?? e.actual) && <span className="text-muted-foreground"> · f {e.forecast ?? '—'} · p {e.previous ?? '—'}{e.actual != null && <> · <span className="font-semibold text-foreground">a {e.actual}</span></>}</span>}
      {e.surprise != null && <span aria-label="Surprise" title={e.surpriseZ == null ? undefined : `${signed(e.surpriseZ)} standard deviations`} className={`ml-1 border px-1 text-[11px] font-semibold ${TONE_CLASS[tone]}`}>{signed(e.surprise)}</span>}
      {e.moves.length > 0 && <span className="block truncate text-[11px] text-muted-foreground">Moves: {e.moves.map(shortSymbol).join(', ')}</span>}
      {lines.map(l => <span key={l} className="num block text-[11px]">{l}</span>)}
      {open && <>
        {e.spec && <span className="mt-1 block text-[11px] text-muted-foreground">Measures: {e.spec.measures} Usual effect: {e.spec.usualEffect} Why: {e.spec.why}</span>}
        <ScorecardPanel title={e.title} country={e.country} />
      </>}
    </span>
  </li>;
}
