import type { EconomicEvent, NewsItem, ScanResult, TaskTrigger } from '@aitrader/contracts';
import { MAX_SEEN, type AgentTask, type Fresh } from './agent-task';
import { branchInstruction, briefKey, figuresOf, specLine, surpriseText } from './event-brief';
import type { MoveWatch } from './move-watch';

export type NewsWatch = Extract<TaskTrigger, { kind: 'news' }>;
export type EventWatch = Extract<TaskTrigger, { kind: 'event' }>;
type ScreenWatch = Extract<TaskTrigger, { kind: 'screen' }>;
export type Watch = NewsWatch | EventWatch | ScreenWatch | MoveWatch;
const NEWS_RANK: Readonly<Record<NewsItem['impact'], number>> = { high: 3, medium: 2, low: 1 };
const EVENT_RANK: Readonly<Record<EconomicEvent['impact'], number>> = { High: 3, Medium: 2, Low: 1, Holiday: 0 };
const EVENT_MAX_AGE_MS = 6 * 3_600_000;
const MAX_LISTED = 5;

export const isWatch = (trigger: TaskTrigger): trigger is Watch => trigger.kind === 'news' || trigger.kind === 'event' || trigger.kind === 'screen' || trigger.kind === 'move';

/** The markets a headline touches, from the instruments it names and the asset classes it moves. */
function marketsOf(item: Pick<NewsItem, 'symbols' | 'moves'>): Set<string> {
  const out = new Set<string>();
  for (const s of [...item.symbols, ...item.moves]) {
    const [exchange = '', ticker = ''] = s.split(':');
    if (exchange === 'NSE' || exchange === 'BSE') out.add('india');
    else if (exchange === 'MCX') { out.add('india'); out.add('commodities'); }
    else if (exchange === 'NASDAQ' || exchange === 'NYSE' || s === 'US stocks') out.add('us');
    else if (exchange === 'FX') { out.add('forex'); if (ticker.includes('INR')) out.add('india'); }
    else if (exchange === 'OANDA') out.add(/^X(AU|AG|PT)|^(WTI|BCO)/.test(ticker) ? 'commodities' : 'forex');
  }
  return out;
}

export function newsMatches(trigger: NewsWatch, item: NewsItem): boolean {
  if (NEWS_RANK[item.impact] < NEWS_RANK[trigger.minImpact]) return false;
  if (!trigger.markets.includes('all')) {
    const markets = marketsOf(item);
    if (!trigger.markets.some(m => markets.has(m))) return false;
  }
  if (trigger.symbols.length > 0 && !trigger.symbols.some(s => item.symbols.includes(s) || item.moves.includes(s))) return false;
  if (trigger.keywords.length > 0) {
    const text = `${item.title} ${item.summary ?? ''}`.toLowerCase();
    if (!trigger.keywords.some(k => text.includes(k.toLowerCase()))) return false;
  }
  return true;
}

/** New matching headlines: published after the task was made and never reported by it before. One wake-up carries all of them. */
export function freshNews(task: Pick<AgentTask, 'createdAt' | 'seen'>, trigger: NewsWatch, items: NewsItem[]): Fresh | null {
  const hits = items.filter(i => Date.parse(i.publishedAt) >= task.createdAt && !task.seen.includes(i.id) && newsMatches(trigger, i))
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  if (hits.length === 0) return null;
  const lines = hits.slice(0, MAX_LISTED).map(h => `- [${h.impact}] ${h.title} (${h.source})${h.moves.length ? `; likely moves ${h.moves.join(', ')}` : ''}${h.direction ? `, ${h.direction}` : ''}`);
  const more = hits.length > MAX_LISTED ? `\n- and ${String(hits.length - MAX_LISTED)} more` : '';
  return { ids: hits.map(h => h.id), reason: `${String(hits.length)} new headline${hits.length === 1 ? '' : 's'}:\n${lines.join('\n')}${more}` };
}

const releaseTime = (trigger: EventWatch, event: Pick<EconomicEvent, 'at'>): number => Date.parse(event.at) + trigger.afterMinutes * 60_000;

const matchesEvent = (trigger: EventWatch, e: EconomicEvent): boolean => {
  const wanted = trigger.title?.toLowerCase();
  return EVENT_RANK[e.impact] >= EVENT_RANK[trigger.minImpact] && (trigger.countries.length === 0 || trigger.countries.includes(e.country))
    && (!wanted || e.title.toLowerCase().includes(wanted));
};

/** A surprise watch waits this long after the release for the actual to be captured, then gives up on the event. */
const ACTUAL_WAIT_MS = 90 * 60_000;
const hasSurpriseRule = (trigger: EventWatch): boolean => trigger.minSurprise !== undefined || trigger.minSurpriseZ !== undefined;

/** With a surprise threshold only a captured actual far enough from the forecast counts (either threshold is enough). */
const surprising = (trigger: EventWatch, e: EconomicEvent): boolean => !hasSurpriseRule(trigger) || (!!e.actual
  && ((trigger.minSurprise !== undefined && e.surprise != null && Math.abs(e.surprise) >= trigger.minSurprise)
    || (trigger.minSurpriseZ !== undefined && e.surpriseZ != null && Math.abs(e.surpriseZ) >= trigger.minSurpriseZ)));

/**
 * Events whose release plus delay has passed (within 6 hours), made after the task, not reported before. With a surprise threshold an event without an actual
 * is not consumed: it is checked again each pass until release + 90 minutes.
 */
export function dueEvents(task: Pick<AgentTask, 'createdAt' | 'seen'>, trigger: EventWatch, events: EconomicEvent[], now: number): EconomicEvent[] {
  return events.filter(e => {
    const fireAt = releaseTime(trigger, e);
    const inWindow = hasSurpriseRule(trigger) ? now - Date.parse(e.at) < ACTUAL_WAIT_MS : now - fireAt < EVENT_MAX_AGE_MS;
    return fireAt <= now && inWindow && fireAt > task.createdAt && !task.seen.includes(e.id) && matchesEvent(trigger, e) && surprising(trigger, e);
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Events about to be released that a brief was asked for: the brief time has come, the release has not, the task existed at the brief time, no brief yet. */
export function dueBriefs(task: Pick<AgentTask, 'createdAt' | 'seen'>, trigger: EventWatch, events: EconomicEvent[], now: number): EconomicEvent[] {
  if (trigger.briefMinutes === undefined) return [];
  const lead = trigger.briefMinutes * 60_000;
  return events.filter(e => {
    const at = Date.parse(e.at);
    return at - lead <= now && now < at && at - lead > task.createdAt && !task.seen.includes(briefKey(e.id)) && !task.seen.includes(e.id) && matchesEvent(trigger, e);
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Wake-up text for a release: the figures, the surprise, the spec and how the instruments moved (`changes`, already formatted). */
export function eventReason(event: EconomicEvent, changes: string[], briefInThread = false): string {
  const figures = [surpriseText(event), figuresOf(event)].filter(Boolean).join(', ');
  return `${event.title} (${event.country}, ${event.impact}) was due ${event.at}${figures ? `; ${figures}` : ''}.${specLine(event.spec)}`
    + (changes.length ? ` Moves since: ${changes.join('; ')}.` : ' No instrument moves to report.') + branchInstruction(briefInThread);
}

/** The reply the assistant gives to a fired watch: `REPORT:` is shown to the user, anything else is not. */
export function parseWatchReply(reply: string): { report: boolean; text: string } {
  const lines = reply.trim().split('\n');
  const first = lines.shift()?.trim() ?? '';
  const match = /^REPORT:\s*(.*)$/i.exec(first);
  if (!match) return { report: false, text: first };
  return { report: true, text: [match[1] ?? '', ...lines].join('\n').trim() };
}

export const WATCH_REPLY_RULE = 'Decide whether this is worth the user\'s attention. Reply with a first line that is exactly "REPORT: <one-line summary>" followed by details if it is, or '
  + '"SILENT: <why>" if it is not. Only a REPORT is shown to the user.';

/** A plain-words name for a watch, used as the task title. */
export function describeWatch(trigger: Watch): string {
  if (trigger.kind === 'screen') {
    const { spec } = trigger;
    return `Screen: ${spec.preset ?? 'custom conditions'} on ${spec.universe} ${spec.interval}`;
  }
  if (trigger.kind === 'move') {
    const what = trigger.symbols.length ? trigger.symbols.join(', ') : trigger.universe ?? 'instruments';
    const way = trigger.direction === 'up' ? 'up ' : trigger.direction === 'down' ? 'down ' : '';
    return `Move: ${what} ${way}${String(trigger.minPct)}% in ${String(trigger.minutes)} min`;
  }
  if (trigger.kind === 'event') {
    const who = trigger.countries.length ? trigger.countries.join('/') : 'any country';
    return `Event: ${trigger.title ?? 'releases'} (${who}, ${trigger.minImpact.toLowerCase()}+, ${String(trigger.afterMinutes)} min after${trigger.minSurprise !== undefined ? `, surprise >= ${String(trigger.minSurprise)}` : ''}${trigger.minSurpriseZ !== undefined ? `, z >= ${String(trigger.minSurpriseZ)}` : ''}${trigger.briefMinutes !== undefined ? `, brief ${String(trigger.briefMinutes)} min before` : ''})`;
  }
  const scope = [trigger.markets.join('/'), ...trigger.symbols, ...trigger.keywords.map(k => `"${k}"`)].join(' ');
  return `News: ${scope} (${trigger.minImpact}+)`;
}

const istDay = (ms: number): string => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
const MAX_ROWS_LISTED = 8;
const signed = (n: number | null): string => (n === null ? '' : ` (${n >= 0 ? '+' : ''}${n.toFixed(2)}%)`);

/**
 * A screen watch looks at each closed bar once (`bar:<time>` is remembered) and reports a symbol at most once a day
 * (`<symbol>:<IST date>`). Returns the wake-up when something is new; otherwise the seen list to save, changed only when the bar is new.
 */
export function screenOutcome(task: Pick<AgentTask, 'seen'>, result: ScanResult, now: number): { fresh: Fresh | null; seen: string[] } {
  if (result.asOfBar === null) return { fresh: null, seen: task.seen };
  const barKey = `bar:${String(result.asOfBar)}`;
  if (task.seen.includes(barKey)) return { fresh: null, seen: task.seen };
  const day = istDay(now);
  const hits = result.rows.filter(r => !task.seen.includes(`${r.symbol}:${day}`));
  if (hits.length === 0) return { fresh: null, seen: [...task.seen, barKey].slice(-MAX_SEEN) };
  const lines = hits.slice(0, MAX_ROWS_LISTED).map(r => {
    const values = Object.entries(r.values).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${String(Math.round((v ?? 0) * 100) / 100)}`).join(', ');
    return `- ${r.symbol} last ${String(r.last)}${signed(r.changePct)}${values ? `; ${values}` : ''}`;
  });
  const more = hits.length > MAX_ROWS_LISTED ? `\n- and ${String(hits.length - MAX_ROWS_LISTED)} more` : '';
  const what = result.preset ?? 'custom screen';
  const reason = `${String(hits.length)} new match${hits.length === 1 ? '' : 'es'} for ${what} on ${result.universe} ${result.interval} (bar ${new Date(result.asOfBar).toISOString()}):\n${lines.join('\n')}${more}`;
  return { fresh: { ids: [barKey, ...hits.map(r => `${r.symbol}:${day}`)], reason, deskSymbol: (hits[0] as (typeof hits)[number]).symbol }, seen: task.seen };
}
