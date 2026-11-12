import type { EconomicEvent, NewsItem } from '@aitrader/contracts';
import { describe, expect, it } from 'vitest';
import { tickWatch, afterRun, type AgentTask } from './agent-task';
import { describeWatch, dueEvents, eventReason, freshNews, newsMatches, parseWatchReply, type EventWatch, type NewsWatch } from './watch';

const t0 = Date.parse('2026-11-12T04:00:00Z');
const news = (patch: Partial<NewsItem> = {}): NewsItem => ({ id: 'n1', source: 'ET', title: 'RBI cuts repo rate by 25 bps', url: 'https://x.test/1', summary: null,
  publishedAt: new Date(t0 + 60_000).toISOString(), symbols: [], impact: 'high', moves: ['NSE:NIFTY', 'FX:USDINR'], direction: 'up', ...patch });
const watch = (patch: Partial<NewsWatch> = {}): NewsWatch => ({ kind: 'news', markets: ['all'], symbols: [], keywords: [], minImpact: 'medium', ...patch });
const task = { createdAt: t0, seen: [] as string[] };

describe('news watch matching', () => {
  it('filters by minimum impact', () => {
    expect(newsMatches(watch({ minImpact: 'high' }), news({ impact: 'medium' }))).toBe(false);
    expect(newsMatches(watch({ minImpact: 'medium' }), news({ impact: 'high' }))).toBe(true);
  });
  it('filters by market from the instruments a headline names or moves', () => {
    expect(newsMatches(watch({ markets: ['india'] }), news())).toBe(true);
    expect(newsMatches(watch({ markets: ['us'] }), news())).toBe(false);
    expect(newsMatches(watch({ markets: ['forex'] }), news())).toBe(true);
    expect(newsMatches(watch({ markets: ['commodities'] }), news({ moves: ['MCX:CRUDEOIL1!'] }))).toBe(true);
    expect(newsMatches(watch({ markets: ['us'] }), news({ moves: ['US stocks', 'MCX:GOLD1!'] }))).toBe(true);
    expect(newsMatches(watch({ markets: ['india'] }), news({ moves: [] }))).toBe(false);
  });
  it('filters by symbol and by keyword (case-insensitive, title or summary)', () => {
    expect(newsMatches(watch({ symbols: ['NSE:NIFTY'] }), news())).toBe(true);
    expect(newsMatches(watch({ symbols: ['NSE:TCS'] }), news())).toBe(false);
    expect(newsMatches(watch({ keywords: ['REPO'] }), news())).toBe(true);
    expect(newsMatches(watch({ keywords: ['opec'] }), news({ summary: 'OPEC+ extends cuts' }))).toBe(true);
    expect(newsMatches(watch({ keywords: ['opec'] }), news())).toBe(false);
  });
});

describe('freshNews', () => {
  it('carries every new matching headline once, oldest first, with impact and moves', () => {
    const fresh = freshNews(task, watch(), [news({ id: 'b', publishedAt: new Date(t0 + 120_000).toISOString(), title: 'Second' }), news({ id: 'a', title: 'First' })]);
    expect(fresh?.ids).toEqual(['a', 'b']);
    expect(fresh?.reason).toBe('2 new headlines:\n- [high] First (ET); likely moves NSE:NIFTY, FX:USDINR, up\n- [high] Second (ET); likely moves NSE:NIFTY, FX:USDINR, up');
  });
  it('skips headlines already reported and ones published before the watch was made', () => {
    expect(freshNews({ ...task, seen: ['n1'] }, watch(), [news()])).toBeNull();
    expect(freshNews(task, watch(), [news({ publishedAt: new Date(t0 - 1).toISOString() })])).toBeNull();
  });
});

const event = (patch: Partial<EconomicEvent> = {}): EconomicEvent => ({ id: 'e1', title: 'RBI Policy Rate Decision', country: 'INR', at: new Date(t0 + 600_000).toISOString(),
  impact: 'High', forecast: '5.25%', previous: '5.50%', moves: ['NSE:NIFTY', 'NSE:BANKNIFTY'], ...patch });
const watchEvent = (patch: Partial<EventWatch> = {}): EventWatch => ({ kind: 'event', countries: [], minImpact: 'High', afterMinutes: 5, ...patch });
const release = t0 + 600_000;

describe('dueEvents', () => {
  it('is due only once release plus the delay has passed', () => {
    expect(dueEvents(task, watchEvent(), [event()], release + 4 * 60_000)).toEqual([]);
    expect(dueEvents(task, watchEvent(), [event()], release + 5 * 60_000).map(e => e.id)).toEqual(['e1']);
    expect(dueEvents(task, watchEvent({ afterMinutes: 0 }), [event()], release).map(e => e.id)).toEqual(['e1']);
  });
  it('filters by country, title and impact, and ignores reported, older and long-past events', () => {
    const now = release + 10 * 60_000;
    expect(dueEvents(task, watchEvent({ countries: ['USD'] }), [event()], now)).toEqual([]);
    expect(dueEvents(task, watchEvent({ countries: ['USD', 'INR'] }), [event()], now)).toHaveLength(1);
    expect(dueEvents(task, watchEvent({ title: 'cpi' }), [event()], now)).toEqual([]);
    expect(dueEvents(task, watchEvent({ title: 'policy rate' }), [event()], now)).toHaveLength(1);
    expect(dueEvents(task, watchEvent({ minImpact: 'High' }), [event({ impact: 'Medium' })], now)).toEqual([]);
    expect(dueEvents({ ...task, seen: ['e1'] }, watchEvent(), [event()], now)).toEqual([]);
    expect(dueEvents({ ...task, createdAt: release + 6 * 60_000 }, watchEvent(), [event()], now)).toEqual([]);
    expect(dueEvents(task, watchEvent(), [event()], release + 7 * 3_600_000)).toEqual([]);
  });
  it('words the wake-up with the figures and the moves', () => {
    expect(eventReason(event(), ['NSE:NIFTY +0.60% on the day'])).toBe(`RBI Policy Rate Decision (INR, High) was due ${event().at}; forecast 5.25%, previous 5.50%. Moves since: NSE:NIFTY +0.60% on the day.`);
  });
});

describe('tickWatch', () => {
  const base: AgentTask = { id: 't', userId: 'u', threadId: 'th', mode: 'agent', title: 'w', instruction: 'i', trigger: watch(), state: 'active', runs: 0, maxRuns: 3, armed: true,
    lastRunAt: null, nextRunAt: null, lastError: null, lastOutcome: null, autoTrade: null, desk: null, seen: [], expiresAt: t0 + 86_400_000, createdAt: t0 };
  const typed = (patch: Partial<AgentTask> = {}) => ({ ...base, ...patch, trigger: watch() });
  it('fires with the new ids remembered, and does nothing without news', () => {
    const fired = tickWatch(typed(), t0, { ids: ['a'], reason: 'r' });
    expect(fired).toMatchObject({ fire: true, reason: 'r', task: { seen: ['a'] } });
    expect(tickWatch(typed(), t0, null).fire).toBe(false);
  });
  it('keeps only the newest 200 ids and expires past its deadline', () => {
    const many = Array.from({ length: 199 }, (_, i) => `x${String(i)}`);
    const fired = tickWatch(typed({ seen: many }), t0, { ids: ['a', 'b'], reason: 'r' });
    expect(fired.task.seen).toHaveLength(200);
    expect(fired.task.seen.at(-1)).toBe('b');
    expect(tickWatch(typed(), t0 + 2 * 86_400_000, { ids: ['a'], reason: 'r' })).toMatchObject({ fire: false, task: { state: 'expired' } });
  });
  it('a run the daily cap refused does not use up a run, and a normal run does', () => {
    expect(afterRun(typed(), t0, null, 'capped')).toMatchObject({ runs: 0, lastOutcome: 'capped' });
    expect(afterRun(typed(), t0, null, 'silent')).toMatchObject({ runs: 1, lastOutcome: 'silent', state: 'active' });
  });
});

describe('parseWatchReply', () => {
  it('reads REPORT and SILENT from the first line only', () => {
    expect(parseWatchReply('REPORT: Big move\nmore')).toEqual({ report: true, text: 'Big move\nmore' });
    expect(parseWatchReply('report: lower case ok')).toEqual({ report: true, text: 'lower case ok' });
    expect(parseWatchReply('SILENT: nothing')).toEqual({ report: false, text: 'SILENT: nothing' });
    expect(parseWatchReply('Sure.\nREPORT: late')).toEqual({ report: false, text: 'Sure.' });
  });
});

describe('describeWatch', () => {
  it('names a watch in plain words', () => {
    expect(describeWatch(watch({ markets: ['india'], keywords: ['rbi'], minImpact: 'high' }))).toBe('News: india "rbi" (high+)');
    expect(describeWatch(watchEvent({ countries: ['INR'], title: 'policy' }))).toBe('Event: policy (INR, high+, 5 min after)');
  });
});
