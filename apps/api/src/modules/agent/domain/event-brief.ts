import type { EconomicEvent, EventReaction, EventScorecard, EventSpec } from '@aitrader/contracts';

export const briefKey = (eventId: string): string => `brief:${eventId}`;

const signed = (n: number): string => `${n >= 0 ? '+' : ''}${String(Math.round(n * 100) / 100)}`;
const pct = (n: number | null, label: string): string => (n === null ? '' : ` ${n >= 0 ? '+' : ''}${n.toFixed(2)}% (${label})`);
const orNa = (n: number | null, render: (n: number) => string): string => (n === null ? 'n/a' : render(n));

/** One line per instrument the event moved: `NIFTY +0.12% (5m) +0.20% (15m)`; instruments without bars are left out. */
export function formatReactions(reactions: EventReaction[] | undefined): string[] {
  return (reactions ?? []).map(r => ({ symbol: r.symbol, text: `${pct(r.move5Pct, '5m')}${pct(r.move15Pct, '15m')}${pct(r.move60Pct, '60m')}` }))
    .filter(x => x.text !== '').map(x => `${x.symbol}${x.text}`);
}

const BETTER: Record<EventSpec['beat'], string> = { 'higher-better': 'higher', 'lower-better': 'lower', unknown: 'unclear' };
export const specLine = (spec: EventSpec | null | undefined): string => (spec
  ? ` What it is: ${spec.measures} Usual effect: ${spec.usualEffect} Better when: ${BETTER[spec.beat]}.`
  : '');

export const figuresOf = (event: Pick<EconomicEvent, 'forecast' | 'previous'>): string =>
  [event.forecast ? `forecast ${event.forecast}` : null, event.previous ? `previous ${event.previous}` : null].filter(Boolean).join(', ');

/** Said after the release when a brief was written earlier in this thread. */
export function branchInstruction(briefInThread: boolean): string {
  return briefInThread ? ' Say which branch happened (the actual vs forecast) and whether the move matched the brief.' : '';
}

/** What the model must do with a brief: both branches, only the given numbers, no forecast of the actual. */
export function briefInstruction(): string {
  return 'Write a brief with two branches: actual above forecast, and actual below forecast. For each give the usual effect on each instrument listed and what you would watch. '
    + 'Use ONLY the numbers given here; do not predict the actual. Reply "REPORT:" followed by the brief.';
}

export const surpriseText = (event: Pick<EconomicEvent, 'actual' | 'surprise' | 'surpriseZ'>): string => {
  if (!event.actual) return '';
  const surprise = event.surprise == null ? '' : `surprise ${signed(event.surprise)}${event.surpriseZ == null ? '' : ` (z ${signed(event.surpriseZ)})`}`;
  return [`actual ${event.actual}`, surprise].filter(Boolean).join(', ');
};

export interface HeldPosition { symbol: string; quantity: number; side: string }

const SCORECARD_RELEASES = 5;

function historyLines(scorecard: EventScorecard | null): string[] {
  const past = scorecard?.releases.slice(0, SCORECARD_RELEASES) ?? [];
  if (!scorecard || past.length === 0) return ['No stored history for this event.'];
  const lines = ['Last releases (surprise, then 15-minute move):'];
  for (const r of past) {
    const moves = r.reactions.filter(x => x.move15Pct !== null).map(x => `${x.symbol} ${signed(x.move15Pct ?? 0)}%`).join(', ');
    lines.push(`- ${r.at.slice(0, 10)}: actual ${r.actual ?? 'n/a'} vs forecast ${r.forecast ?? 'n/a'}, surprise ${orNa(r.surprise, signed)}; ${moves || 'no moves stored'}`);
  }
  for (const s of scorecard.stats) {
    lines.push(`- ${s.symbol} over ${String(s.n)} releases: average absolute 15m move ${orNa(s.avgAbsMove15Pct, n => `${n.toFixed(2)}%`)}, after a beat ${orNa(s.avgMove15WhenBeatPct, n => `${signed(n)}%`)}, `
      + `after a miss ${orNa(s.avgMove15WhenMissPct, n => `${signed(n)}%`)}, followed the surprise ${orNa(s.followedSurprisePct, n => `${n.toFixed(0)}%`)} of the time`);
  }
  return lines;
}

/** Wake-up text before a release: the event, the history of its surprises against the 15-minute move, and what the user holds that it may move. */
export function briefReason(event: EconomicEvent, scorecard: EventScorecard | null, positions: HeldPosition[]): string {
  const figures = figuresOf(event);
  const lines = [`Pre-event brief: ${event.title} (${event.country}, ${event.impact}) is due ${event.at}${figures ? `; ${figures}` : ''}.${specLine(event.spec ?? scorecard?.spec)}`];
  if (event.moves.length) lines.push(`Instruments it usually moves: ${event.moves.join(', ')}.`);
  lines.push(...historyLines(scorecard));
  lines.push(positions.length ? `The user holds: ${positions.map(p => `${p.symbol} ${p.side} ${String(p.quantity)}`).join(', ')}.` : 'The user holds none of these instruments.');
  return `${lines.join('\n')}\n${briefInstruction()}`;
}
