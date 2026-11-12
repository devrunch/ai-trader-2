import type { EconomicEvent, NewsItem, TaskTrigger } from '@aitrader/contracts';
import type { AgentTask, Fresh } from './agent-task';

export type NewsWatch = Extract<TaskTrigger, { kind: 'news' }>;
export type EventWatch = Extract<TaskTrigger, { kind: 'event' }>;
export type Watch = NewsWatch | EventWatch;
const NEWS_RANK: Readonly<Record<NewsItem['impact'], number>> = { high: 3, medium: 2, low: 1 };
const EVENT_RANK: Readonly<Record<EconomicEvent['impact'], number>> = { High: 3, Medium: 2, Low: 1, Holiday: 0 };
const EVENT_MAX_AGE_MS = 6 * 3_600_000;
const MAX_LISTED = 5;

export const isWatch = (trigger: TaskTrigger): trigger is Watch => trigger.kind === 'news' || trigger.kind === 'event';

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

/** Events whose release plus delay has passed (within 6 hours), made after the task, not reported before. */
export function dueEvents(task: Pick<AgentTask, 'createdAt' | 'seen'>, trigger: EventWatch, events: EconomicEvent[], now: number): EconomicEvent[] {
  const wanted = trigger.title?.toLowerCase();
  return events.filter(e => {
    const fireAt = releaseTime(trigger, e);
    return fireAt <= now && now - fireAt < EVENT_MAX_AGE_MS && fireAt > task.createdAt && !task.seen.includes(e.id)
      && EVENT_RANK[e.impact] >= EVENT_RANK[trigger.minImpact] && (trigger.countries.length === 0 || trigger.countries.includes(e.country))
      && (!wanted || e.title.toLowerCase().includes(wanted));
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Wake-up text for a release, with the figures and how its instruments have moved (`changes`, already formatted). */
export function eventReason(event: EconomicEvent, changes: string[]): string {
  const figures = [event.forecast ? `forecast ${event.forecast}` : null, event.previous ? `previous ${event.previous}` : null].filter(Boolean).join(', ');
  return `${event.title} (${event.country}, ${event.impact}) was due ${event.at}${figures ? `; ${figures}` : ''}.`
    + (changes.length ? ` Moves since: ${changes.join('; ')}.` : ' No instrument moves to report.');
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
  if (trigger.kind === 'event') {
    const who = trigger.countries.length ? trigger.countries.join('/') : 'any country';
    return `Event: ${trigger.title ?? 'releases'} (${who}, ${trigger.minImpact.toLowerCase()}+, ${String(trigger.afterMinutes)} min after)`;
  }
  const scope = [trigger.markets.join('/'), ...trigger.symbols, ...trigger.keywords.map(k => `"${k}"`)].join(' ');
  return `News: ${scope} (${trigger.minImpact}+)`;
}
