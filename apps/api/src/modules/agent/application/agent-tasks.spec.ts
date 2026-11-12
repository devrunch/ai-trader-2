import { describe, expect, it, vi } from 'vitest';
import { AgentTasks, type TaskStore } from './agent-tasks';
import type { AgentTask } from '../domain/agent-task';

const t0 = Date.parse('2026-11-11T03:45:00Z');

function memory(): TaskStore & { rows: Map<string, AgentTask> } {
  const rows = new Map<string, AgentTask>();
  return { rows, create: t => { rows.set(t.id, t); return Promise.resolve(); }, save: t => { rows.set(t.id, t); return Promise.resolve(); },
    get: (u, id) => Promise.resolve(rows.get(id)?.userId === u ? rows.get(id) ?? null : null),
    list: u => Promise.resolve([...rows.values()].filter(t => t.userId === u)), active: () => Promise.resolve([...rows.values()].filter(t => t.state === 'active')) };
}

function setup(prices: number[]) {
  const store = memory();
  let n = 0;
  const read = vi.fn(() => Promise.resolve(prices.shift()));
  const tasks = new AgentTasks(store, { read }, { news: () => Promise.resolve([]), events: () => Promise.resolve([]), changes: () => Promise.resolve([]) }, { now: () => t0 + n * 60_000, id: () => `task-${String(++n)}` });
  return { store, tasks, read, advance: () => { n++; } };
}

const breakout = { title: 'INFY breakout', instruction: 'Buy 10 INFY at market', trigger: { kind: 'price' as const, symbol: 'NSE:INFY', op: 'above' as const, value: 1500 } };

describe('AgentTasks', () => {
  it('fires a price task once when the level is crossed, records the run and finishes', async () => {
    const { tasks, store, advance } = setup([1490, 1505]);
    const created = await tasks.create('u1', 'th1', breakout);
    expect(created).toMatchObject({ state: 'active', maxRuns: 1, conditionNow: 1490 });
    advance();
    const fire = vi.fn().mockResolvedValue({ error: null, outcome: 'ran' });
    expect(await tasks.runDue(fire, new AbortController().signal)).toBe(1);
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'INFY breakout' }), 'NSE:INFY price is 1505, above 1500');
    expect([...store.rows.values()][0]).toMatchObject({ state: 'done', runs: 1, lastError: null });
  });

  it('a level that is already passed at creation does not fire until it crosses again', async () => {
    const { tasks } = setup([1510, 1512]);
    await tasks.create('u1', 'th1', breakout);
    const fire = vi.fn().mockResolvedValue({ error: null, outcome: 'ran' });
    expect(await tasks.runDue(fire, new AbortController().signal)).toBe(0);
  });

  it('records a failed run instead of crashing the pass', async () => {
    const { tasks, store } = setup([1490, 1505]);
    await tasks.create('u1', 'th1', { ...breakout, maxRuns: 3 });
    await tasks.runDue(() => Promise.reject(new Error('Daily assistant limit reached')), new AbortController().signal);
    expect([...store.rows.values()][0]).toMatchObject({ state: 'active', runs: 1, lastError: 'Daily assistant limit reached' });
  });

  it('reads each condition once per pass across tasks', async () => {
    const { tasks, read } = setup([1490, 1490, 1505]);
    await tasks.create('u1', 'th1', breakout);
    await tasks.create('u1', 'th1', { ...breakout, title: 'second' });
    read.mockClear();
    await tasks.runDue(vi.fn().mockResolvedValue({ error: null, outcome: 'ran' }), new AbortController().signal);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('refuses bad schedules, and pause, resume and cancel are the owner\'s only', async () => {
    const { tasks } = setup([]);
    await expect(tasks.create('u1', 'th1', { ...breakout, trigger: { kind: 'schedule', cron: '* * * * *', tz: 'Asia/Kolkata' } })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const daily = await tasks.create('u1', 'th1', { ...breakout, trigger: { kind: 'schedule', cron: '30 9 * * 1-5', tz: 'Asia/Kolkata' } });
    expect(daily.nextRunAt).toBe('2026-11-11T04:00:00.000Z');
    await expect(tasks.setState('u2', daily.id, 'cancelled')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await tasks.setState('u1', daily.id, 'paused')).toMatchObject({ state: 'paused' });
    expect(await tasks.setState('u1', daily.id, 'cancelled')).toMatchObject({ state: 'cancelled' });
    await expect(tasks.setState('u1', daily.id, 'active')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('a user alert is a notify task with no thread, named from its condition, repeating on every fresh crossing', async () => {
    const { tasks, advance } = setup([1490, 1505, 1495, 1502]);
    const alert = await tasks.createAlert('u1', { trigger: { kind: 'price', symbol: 'NSE:INFY', op: 'above', value: 1500 }, repeat: true, note: 'check volume' });
    expect(alert).toMatchObject({ mode: 'notify', threadId: null, title: 'NSE:INFY above 1,500', instruction: 'check volume', maxRuns: 500, state: 'active' });
    const fire = vi.fn().mockResolvedValue({ error: null, outcome: 'ran' });
    for (let i = 0; i < 3; i++) { advance(); await tasks.runDue(fire, new AbortController().signal); }
    expect(fire).toHaveBeenCalledTimes(2);
    expect(fire.mock.calls[0]?.[0]).toMatchObject({ mode: 'notify', runs: 0 });
  });
});


describe('AgentTasks watches', () => {
  const published = (offsetMs: number) => new Date(t0 + offsetMs).toISOString();
  const headline = (id: string, title: string, offsetMs: number) => ({ id, source: 'ET', title, url: 'https://x.test/a', summary: null, publishedAt: published(offsetMs), symbols: [],
    impact: 'high' as const, moves: ['NSE:NIFTY'], direction: null });
  function watching(clock: { now: number }, feed: { news: ReturnType<typeof headline>[]; events: Array<Record<string, unknown>> }) {
    const store = memory();
    const reader = { news: vi.fn(() => Promise.resolve(feed.news)), events: vi.fn(() => Promise.resolve(feed.events as never)), changes: vi.fn(() => Promise.resolve(['NSE:NIFTY +0.60% on the day'])) };
    let n = 0;
    const tasks = new AgentTasks(store, { read: vi.fn() }, reader, { now: () => clock.now, id: () => `w-${String(++n)}` });
    const fire = vi.fn<(task: unknown, reason: string) => Promise<{ error: string | null; outcome: 'silent' }>>().mockResolvedValue({ error: null, outcome: 'silent' });
    return { store, tasks, reader, fire };
  }
  const signal = new AbortController().signal;

  it('wakes once per new matching headline, never twice for the same one, with the headlines in the reason', async () => {
    const clock = { now: t0 };
    const feed = { news: [headline('old', 'Old news', -60_000)], events: [] };
    const { tasks, fire, store } = watching(clock, feed);
    await tasks.create('u1', 'th1', { title: 'RBI watch', instruction: 'assess', trigger: { kind: 'news', markets: ['india'], symbols: [], keywords: ['rbi'], minImpact: 'high' }, maxRuns: 5 });
    feed.news.push(headline('a', 'RBI cuts repo rate', 30_000), headline('b', 'Sensex gains', 40_000));
    clock.now = t0 + 60_000;
    expect(await tasks.runDue(fire, signal)).toBe(1);
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'RBI watch' }), expect.stringContaining('RBI cuts repo rate'));
    expect(fire.mock.calls[0]?.[1]).not.toContain('Sensex gains');
    clock.now = t0 + 120_000;
    expect(await tasks.runDue(fire, signal)).toBe(0);
    feed.news.push(headline('c', 'RBI governor speaks', 100_000));
    clock.now = t0 + 180_000;
    expect(await tasks.runDue(fire, signal)).toBe(1);
    expect([...store.rows.values()][0]).toMatchObject({ seen: ['a', 'c'], runs: 2, lastOutcome: 'silent', state: 'active' });
  });

  it('fires an event watch at release plus the delay, once, with forecast, previous and the instrument moves', async () => {
    const clock = { now: t0 };
    const release = t0 + 10 * 60_000;
    const feed = { news: [], events: [{ id: 'e1', title: 'RBI Policy Rate Decision', country: 'INR', at: new Date(release).toISOString(), impact: 'High', forecast: '5.25%', previous: '5.50%', moves: ['NSE:NIFTY', 'US stocks'] }] };
    const { tasks, fire, reader } = watching(clock, feed);
    await tasks.create('u1', 'th1', { title: 'x', instruction: 'assess', trigger: { kind: 'event', countries: ['INR'], minImpact: 'High', afterMinutes: 5 } });
    clock.now = release + 4 * 60_000;
    expect(await tasks.runDue(fire, signal)).toBe(0);
    clock.now = release + 5 * 60_000;
    expect(await tasks.runDue(fire, signal)).toBe(1);
    expect(reader.changes).toHaveBeenCalledWith(['NSE:NIFTY']);
    expect(fire.mock.calls[0]?.[1]).toBe(`RBI Policy Rate Decision (INR, High) was due ${new Date(release).toISOString()}; forecast 5.25%, previous 5.50%. Moves since: NSE:NIFTY +0.60% on the day.`);
    clock.now = release + 6 * 60_000;
    expect(await tasks.runDue(fire, signal)).toBe(0);
  });

  it('a news alert is a notify task named in plain words, with no condition read', async () => {
    const { tasks, reader } = watching({ now: t0 }, { news: [], events: [] });
    const alert = await tasks.createAlert('u1', { trigger: { kind: 'news', markets: ['forex'], symbols: [], keywords: [], minImpact: 'high' }, repeat: true });
    expect(alert).toMatchObject({ mode: 'notify', title: 'News: forex (high+)', maxRuns: 500, conditionNow: null });
    expect(reader.news).not.toHaveBeenCalled();
  });
});

describe('AgentTasks auto-trade', () => {
  const limits = { enabled: true, maxRiskPct: 0.5, maxTradesPerDay: 3, requireBacktest: true };
  it('is switched on and off by the owner for assistant tasks only, never for plain alerts', async () => {
    const { tasks } = setup([]);
    const agent = await tasks.create('u1', 'th1', breakout);
    expect(agent.autoTrade).toBeNull();
    expect(await tasks.setAutoTrade('u1', agent.id, limits)).toMatchObject({ autoTrade: limits });
    expect(await tasks.setAutoTrade('u1', agent.id, null)).toMatchObject({ autoTrade: null });
    await expect(tasks.setAutoTrade('u2', agent.id, limits)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const alert = await tasks.createAlert('u1', { trigger: { kind: 'price', symbol: 'NSE:INFY', op: 'above', value: 1500 }, repeat: false });
    await expect(tasks.setAutoTrade('u1', alert.id, limits)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
