import { describe, expect, it, vi } from 'vitest';
import { AgentTasks, type Dispatcher, type FireTask, type TaskStore } from './agent-tasks';
import type { AgentTask } from '../domain/agent-task';

/** A dispatcher that runs everything inline, like a plain alert. */
const inline = (fire: FireTask): Dispatcher => ({ queues: () => false, enqueue: vi.fn(), runInline: fire });

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
    expect(await tasks.runDue(inline(fire), new AbortController().signal)).toBe(1);
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'INFY breakout' }), 'NSE:INFY price is 1505, above 1500');
    expect([...store.rows.values()][0]).toMatchObject({ state: 'done', runs: 1, lastError: null });
  });

  it('a level that is already passed at creation does not fire until it crosses again', async () => {
    const { tasks } = setup([1510, 1512]);
    await tasks.create('u1', 'th1', breakout);
    const fire = vi.fn().mockResolvedValue({ error: null, outcome: 'ran' });
    expect(await tasks.runDue(inline(fire), new AbortController().signal)).toBe(0);
  });

  it('records a failed run instead of crashing the pass', async () => {
    const { tasks, store } = setup([1490, 1505]);
    await tasks.create('u1', 'th1', { ...breakout, maxRuns: 3 });
    await tasks.runDue(inline(() => Promise.reject(new Error('Daily assistant limit reached'))), new AbortController().signal);
    expect([...store.rows.values()][0]).toMatchObject({ state: 'active', runs: 1, lastError: 'Daily assistant limit reached' });
  });

  it('reads each condition once per pass across tasks', async () => {
    const { tasks, read } = setup([1490, 1490, 1505]);
    await tasks.create('u1', 'th1', breakout);
    await tasks.create('u1', 'th1', { ...breakout, title: 'second' });
    read.mockClear();
    await tasks.runDue(inline(vi.fn().mockResolvedValue({ error: null, outcome: 'ran' })), new AbortController().signal);
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
    for (let i = 0; i < 3; i++) { advance(); await tasks.runDue(inline(fire), new AbortController().signal); }
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
    expect(await tasks.runDue(inline(fire), signal)).toBe(1);
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'RBI watch' }), expect.stringContaining('RBI cuts repo rate'));
    expect(fire.mock.calls[0]?.[1]).not.toContain('Sensex gains');
    clock.now = t0 + 120_000;
    expect(await tasks.runDue(inline(fire), signal)).toBe(0);
    feed.news.push(headline('c', 'RBI governor speaks', 100_000));
    clock.now = t0 + 180_000;
    expect(await tasks.runDue(inline(fire), signal)).toBe(1);
    expect([...store.rows.values()][0]).toMatchObject({ seen: ['a', 'c'], runs: 2, lastOutcome: 'silent', state: 'active' });
  });

  it('fires an event watch at release plus the delay, once, with forecast, previous and the instrument moves', async () => {
    const clock = { now: t0 };
    const release = t0 + 10 * 60_000;
    const feed = { news: [], events: [{ id: 'e1', title: 'RBI Policy Rate Decision', country: 'INR', at: new Date(release).toISOString(), impact: 'High', forecast: '5.25%', previous: '5.50%', moves: ['NSE:NIFTY', 'US stocks'] }] };
    const { tasks, fire, reader } = watching(clock, feed);
    await tasks.create('u1', 'th1', { title: 'x', instruction: 'assess', trigger: { kind: 'event', countries: ['INR'], minImpact: 'High', afterMinutes: 5 } });
    clock.now = release + 4 * 60_000;
    expect(await tasks.runDue(inline(fire), signal)).toBe(0);
    clock.now = release + 5 * 60_000;
    expect(await tasks.runDue(inline(fire), signal)).toBe(1);
    expect(reader.changes).toHaveBeenCalledWith(['NSE:NIFTY']);
    expect(fire.mock.calls[0]?.[1]).toBe(`RBI Policy Rate Decision (INR, High) was due ${new Date(release).toISOString()}; forecast 5.25%, previous 5.50%. Moves since: NSE:NIFTY +0.60% on the day.`);
    clock.now = release + 6 * 60_000;
    expect(await tasks.runDue(inline(fire), signal)).toBe(0);
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

describe('AgentTasks queueing (AG-6)', () => {
  function queueing(prices: number[]) {
    const store = memory();
    let n = 0;
    let clock = t0;
    const read = vi.fn(() => Promise.resolve(prices.shift()));
    const tasks = new AgentTasks(store, { read }, { news: () => Promise.resolve([]), events: () => Promise.resolve([]), changes: () => Promise.resolve([]) }, { now: () => clock, id: () => `task-${String(++n)}` });
    const jobs = new Map<string, { taskId: string; key: string }>();
    const enqueue = vi.fn((task: { id: string }, key: string) => { jobs.set(`${task.id}-${key}`, { taskId: task.id, key }); return Promise.resolve(); });
    const dispatcher: Dispatcher = { queues: () => true, enqueue, runInline: vi.fn() };
    return { store, tasks, jobs, enqueue, dispatcher, at: (ms: number) => { clock = t0 + ms; } };
  }
  const signal = new AbortController().signal;
  const schedule = { title: 'Daily', instruction: 'brief', trigger: { kind: 'schedule' as const, cron: '*/10 * * * *', tz: 'UTC' } };

  it('a due task is saved as queued with what to run, and only then enqueued: the tick runs no model', async () => {
    const q = queueing([]);
    const created = await q.tasks.create('u1', 'th1', schedule);
    q.at(11 * 60_000);
    expect(await q.tasks.runDue(q.dispatcher, signal)).toBe(1);
    const saved = q.store.rows.get(created.id);
    expect(saved).toMatchObject({ runState: 'queued', runs: 0, lastOutcome: null, pendingFire: { reason: expect.stringContaining('scheduled run') as unknown } });
    expect(q.enqueue).toHaveBeenCalledOnce();
    expect(q.jobs.size).toBe(1);
  });

  it('a queued task is not fired again while its run is pending, so one fire is one job', async () => {
    const q = queueing([]);
    await q.tasks.create('u1', 'th1', schedule);
    q.at(11 * 60_000);
    await q.tasks.runDue(q.dispatcher, signal);
    q.at(15 * 60_000);
    expect(await q.tasks.runDue(q.dispatcher, signal)).toBe(0);
    expect(q.enqueue).toHaveBeenCalledOnce();
  });

  it('the fire key is the same for the same fire and differs for the next one', async () => {
    const q = queueing([]);
    const created = await q.tasks.create('u1', 'th1', schedule);
    q.at(11 * 60_000);
    await q.tasks.runDue(q.dispatcher, signal);
    const first = q.store.rows.get(created.id)?.pendingFire?.key;
    const task = q.store.rows.get(created.id);
    if (!task) throw new Error('missing');
    q.store.rows.set(task.id, { ...task, runState: 'idle', pendingFire: null, runs: 1 });
    q.at(21 * 60_000);
    await q.tasks.runDue(q.dispatcher, signal);
    expect(q.store.rows.get(created.id)?.pendingFire?.key).not.toBe(first);
    expect(q.jobs.size).toBe(2);
  });

  it('if the queue is down the task goes back as it was and fires on the next tick instead of being lost', async () => {
    const q = queueing([]);
    const created = await q.tasks.create('u1', 'th1', schedule);
    q.enqueue.mockRejectedValueOnce(new Error('redis down'));
    q.at(11 * 60_000);
    await q.tasks.runDue(q.dispatcher, signal);
    expect(q.store.rows.get(created.id)).toMatchObject({ runState: 'idle', pendingFire: null, runs: 0 });
    q.at(12 * 60_000);
    expect(await q.tasks.runDue(q.dispatcher, signal)).toBe(1);
    expect(q.store.rows.get(created.id)).toMatchObject({ runState: 'queued' });
  });

  it('recovers a queued run nobody picked up for ten minutes by queueing the same fire again', async () => {
    const q = queueing([]);
    const created = await q.tasks.create('u1', 'th1', schedule);
    q.at(11 * 60_000);
    await q.tasks.runDue(q.dispatcher, signal);
    const key = q.store.rows.get(created.id)?.pendingFire?.key;
    q.at(15 * 60_000);
    await q.tasks.runDue(q.dispatcher, signal);
    expect(q.enqueue).toHaveBeenCalledTimes(1);
    q.at(22 * 60_000);
    await q.tasks.runDue(q.dispatcher, signal);
    expect(q.enqueue).toHaveBeenCalledTimes(2);
    expect(q.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({ id: created.id }), key);
    expect(q.jobs.size).toBe(1);
    expect(q.store.rows.get(created.id)?.runStateAt).toBe(t0 + 22 * 60_000);
  });


  describe('screen watches', () => {
    const scanRow = (symbol: string) => ({ symbol, name: null, last: 100, changePct: 3, barTime: 1, values: { rsi: 25 }, spark: [] });
    const scanResult = (asOfBar: number, symbols: string[]) => ({ universe: 'nifty50' as const, interval: '1D' as const, preset: 'rsi-oversold', asOfBar, scanned: 50, matched: symbols.length,
      rows: symbols.map(scanRow), stale: [], durationMs: 1, cached: false });

    it('scans once per pass for tasks sharing a spec, fires on new matches only, and does not report a symbol twice in a day or a bar twice', async () => {
      const clock = { now: t0 };
      const store = memory();
      let next = scanResult(1000, ['NSE:A']);
      const screen = vi.fn(() => Promise.resolve(next));
      let n = 0;
      const tasks = new AgentTasks(store, { read: vi.fn() }, { news: () => Promise.resolve([]), events: () => Promise.resolve([]), changes: () => Promise.resolve([]), screen },
        { now: () => clock.now, id: () => `s-${String(++n)}` });
      const trigger = { kind: 'screen' as const, spec: { universe: 'nifty50' as const, interval: '1D' as const, preset: 'rsi-oversold', indicators: [], fundamentals: [], limit: 50 } };
      await tasks.create('u1', 'th1', { title: 'a', instruction: 'x', trigger, maxRuns: 5 });
      await tasks.create('u1', 'th2', { title: 'b', instruction: 'x', trigger, maxRuns: 5 });
      const fire = vi.fn<(task: unknown, reason: string) => Promise<{ error: string | null; outcome: 'silent' }>>().mockResolvedValue({ error: null, outcome: 'silent' });
      const dispatcher = { queues: () => false, enqueue: vi.fn(), runInline: fire };
      const signal = new AbortController().signal;

      expect(await tasks.runDue(dispatcher, signal)).toBe(2);
      expect(screen).toHaveBeenCalledTimes(1);
      expect(fire.mock.calls[0]?.[1]).toContain('1 new match for rsi-oversold on nifty50 1D');
      expect(fire.mock.calls[0]?.[1]).toContain('NSE:A last 100');

      clock.now += 60_000;
      expect(await tasks.runDue(dispatcher, signal)).toBe(0);
      next = scanResult(2000, ['NSE:A', 'NSE:B']);
      clock.now += 60_000;
      expect(await tasks.runDue(dispatcher, signal)).toBe(2);
      expect(fire.mock.calls[2]?.[1]).toContain('NSE:B');
      expect(fire.mock.calls[2]?.[1]).not.toContain('NSE:A last');
      next = scanResult(3000, ['NSE:A', 'NSE:B']);
      expect(await tasks.runDue(dispatcher, signal)).toBe(0);
      expect([...store.rows.values()][0]?.seen).toContain('bar:3000');
    });
  });
});

describe('move and event-desk watches', () => {
  const signal = new AbortController().signal;
  const fireOf = () => vi.fn<(task: unknown, reason: string) => Promise<{ error: string | null; outcome: 'silent' }>>().mockResolvedValue({ error: null, outcome: 'silent' });
  const build = (clock: { now: number }, extra: Record<string, unknown>) => {
    const store = memory();
    let n = 0;
    const reader = { news: () => Promise.resolve([]), events: () => Promise.resolve([] as never[]), changes: vi.fn(() => Promise.resolve(['NSE:NIFTY +0.60% on the day'])), ...extra };
    return { store, reader, tasks: new AgentTasks(store, { read: vi.fn() }, reader, { now: () => clock.now, id: () => `m-${String(++n)}` }) };
  };

  it('reads moves once per pass for all watches sharing a window, wakes once per instrument per hour', async () => {
    const clock = { now: Date.parse('2026-11-12T05:10:00Z') };
    let pct = new Map<string, number | null>([['NSE:A', 3.5], ['NSE:M', 4]]);
    const moves = vi.fn<(symbols: string[], minutes: number, now: number) => Promise<Map<string, number | null>>>(() => Promise.resolve(pct));
    const members = vi.fn(() => Promise.resolve(['NSE:M']));
    const { tasks, store } = build(clock, { moves, members });
    const trigger = { kind: 'move' as const, symbols: ['NSE:A'], universe: 'nifty50' as const, minutes: 15, minPct: 3, direction: 'either' as const };
    await tasks.create('u1', 'th1', { title: 'a', instruction: 'x', trigger, desk: { symbol: 'NSE:NIFTY', rounds: 1 } });
    await tasks.create('u1', 'th2', { title: 'b', instruction: 'x', trigger });
    const fire = fireOf();
    const dispatcher = { queues: () => false, enqueue: vi.fn(), runInline: fire };
    expect(await tasks.runDue(dispatcher, signal)).toBe(2);
    expect(moves).toHaveBeenCalledTimes(1);
    expect(moves.mock.calls[0]?.slice(1)).toEqual([15, clock.now]);
    expect(moves.mock.calls[0]?.[0]).toEqual(['NSE:A', 'NSE:M']);
    expect(members).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls[0]?.[1]).toContain('2 instruments moved at least 3% within 15 minutes:\n- NSE:M +4.00% in 15 min\n- NSE:A +3.50% in 15 min');
    expect([...store.rows.values()][0]?.desk?.symbol).toBe('NSE:M');
    clock.now += 60_000;
    expect(await tasks.runDue(dispatcher, signal)).toBe(0);
    clock.now += 3_600_000;
    pct = new Map([['NSE:A', -3.5]]);
    expect(await tasks.runDue(dispatcher, signal)).toBe(2);
  });

  it('does nothing when moves are not wired or fail', async () => {
    const clock = { now: t0 };
    const trigger = { kind: 'move' as const, symbols: ['NSE:A'], minutes: 15, minPct: 3, direction: 'either' as const };
    const none = build(clock, {});
    await none.tasks.create('u1', 'th1', { title: 'a', instruction: 'x', trigger });
    const fire = fireOf();
    expect(await none.tasks.runDue({ queues: () => false, enqueue: vi.fn(), runInline: fire }, signal)).toBe(0);
    const failing = build(clock, { moves: () => Promise.reject(new Error('down')) });
    await failing.tasks.create('u1', 'th1', { title: 'a', instruction: 'x', trigger });
    expect(await failing.tasks.runDue({ queues: () => false, enqueue: vi.fn(), runInline: fire }, signal)).toBe(0);
  });

  describe('events', () => {
    const release = t0 + 60 * 60_000;
    const base = { id: 'e1', title: 'US CPI', country: 'USD', at: new Date(release).toISOString(), impact: 'High' as const, forecast: '3.1%', previous: '3.0%', moves: ['NSE:NIFTY', 'US stocks'] };
    const trigger = { kind: 'event' as const, countries: ['USD'], minImpact: 'High' as const, afterMinutes: 5, briefMinutes: 30, minSurprise: 0.2 };

    it('briefs 30 minutes before with scorecard and positions, once, then reports the surprise with the branch question and the event reactions', async () => {
      const clock = { now: t0 };
      const events = [{ ...base }] as Array<Record<string, unknown>>;
      const scorecard = vi.fn(() => Promise.resolve({ title: 'US CPI', country: 'USD', spec: null, stats: [], releases: [{ eventId: 'p', at: '2026-10-10T13:30:00.000Z', forecast: '3.0%', previous: null, actual: '3.2%', surprise: 0.2, surpriseZ: null, reactions: [{ symbol: 'NSE:NIFTY', refPrice: 1, move5Pct: -0.1, move15Pct: -0.4, move60Pct: null }] }] }));
      const positions = vi.fn(() => Promise.resolve([{ symbol: 'NSE:NIFTY', quantity: 50, side: 'long' }]));
      const { tasks, reader } = build(clock, { events: () => Promise.resolve(events), scorecard, positions });
      await tasks.create('u1', 'th1', { title: 'cpi', instruction: 'x', trigger, maxRuns: 5 });
      const fire = fireOf();
      const d = { queues: () => false, enqueue: vi.fn(), runInline: fire };
      clock.now = release - 31 * 60_000;
      expect(await tasks.runDue(d, signal)).toBe(0);
      clock.now = release - 30 * 60_000;
      expect(await tasks.runDue(d, signal)).toBe(1);
      expect(positions).toHaveBeenCalledWith('u1', ['NSE:NIFTY']);
      expect(fire.mock.calls[0]?.[1]).toContain('Pre-event brief: US CPI');
      expect(fire.mock.calls[0]?.[1]).toContain('NSE:NIFTY -0.4%');
      expect(fire.mock.calls[0]?.[1]).toContain('The user holds: NSE:NIFTY long 50.');
      clock.now = release - 20 * 60_000;
      expect(await tasks.runDue(d, signal)).toBe(0);
      // Released, no actual yet: a surprise watch keeps waiting.
      clock.now = release + 5 * 60_000;
      expect(await tasks.runDue(d, signal)).toBe(0);
      events[0] = { ...base, actual: '3.4%', surprise: 0.3, surpriseZ: 1.2, reactions: [{ symbol: 'NSE:NIFTY', refPrice: 1, move5Pct: 0.12, move15Pct: 0.2, move60Pct: null }] };
      clock.now = release + 6 * 60_000;
      expect(await tasks.runDue(d, signal)).toBe(1);
      const reason = fire.mock.calls[1]?.[1] ?? '';
      expect(reason).toContain('actual 3.4%, surprise +0.3 (z +1.2), forecast 3.1%, previous 3.0%');
      expect(reason).toContain('Moves since: NSE:NIFTY +0.12% (5m) +0.20% (15m).');
      expect(reason).toContain('Say which branch happened');
      expect(reader.changes).not.toHaveBeenCalled();
    });

    it('falls back to the day change without reactions, and asks no branch question without a brief', async () => {
      const clock = { now: release + 6 * 60_000 };
      const { tasks, reader } = build(clock, { events: () => Promise.resolve([{ ...base, actual: '3.4%', surprise: 0.3 }]) });
      clock.now = release - 10 * 60_000;
      await tasks.create('u1', 'th1', { title: 'cpi', instruction: 'x', trigger: { ...trigger, briefMinutes: undefined } });
      clock.now = release + 6 * 60_000;
      const fire = fireOf();
      expect(await tasks.runDue({ queues: () => false, enqueue: vi.fn(), runInline: fire }, signal)).toBe(1);
      expect(reader.changes).toHaveBeenCalledWith(['NSE:NIFTY']);
      expect(fire.mock.calls[0]?.[1]).toContain('Moves since: NSE:NIFTY +0.60% on the day.');
      expect(fire.mock.calls[0]?.[1]).not.toContain('Say which branch');
    });

    it('skips the brief when the task is made after the brief time', async () => {
      const clock = { now: release - 20 * 60_000 };
      const { tasks } = build(clock, { events: () => Promise.resolve([{ ...base }]) });
      await tasks.create('u1', 'th1', { title: 'cpi', instruction: 'x', trigger });
      clock.now += 60_000;
      expect(await tasks.runDue({ queues: () => false, enqueue: vi.fn(), runInline: fireOf() }, signal)).toBe(0);
    });
  });
});
