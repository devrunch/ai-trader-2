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
  const tasks = new AgentTasks(store, { read }, { now: () => t0 + n * 60_000, id: () => `task-${String(++n)}` });
  return { store, tasks, read, advance: () => { n++; } };
}

const breakout = { title: 'INFY breakout', instruction: 'Buy 10 INFY at market', trigger: { kind: 'price' as const, symbol: 'NSE:INFY', op: 'above' as const, value: 1500 } };

describe('AgentTasks', () => {
  it('fires a price task once when the level is crossed, records the run and finishes', async () => {
    const { tasks, store, advance } = setup([1490, 1505]);
    const created = await tasks.create('u1', 'th1', breakout);
    expect(created).toMatchObject({ state: 'active', maxRuns: 1, conditionNow: 1490 });
    advance();
    const fire = vi.fn().mockResolvedValue(null);
    expect(await tasks.runDue(fire, new AbortController().signal)).toBe(1);
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'INFY breakout' }), 'NSE:INFY price is 1505, above 1500');
    expect([...store.rows.values()][0]).toMatchObject({ state: 'done', runs: 1, lastError: null });
  });

  it('a level that is already passed at creation does not fire until it crosses again', async () => {
    const { tasks } = setup([1510, 1512]);
    await tasks.create('u1', 'th1', breakout);
    const fire = vi.fn().mockResolvedValue(null);
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
    await tasks.runDue(vi.fn().mockResolvedValue(null), new AbortController().signal);
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
    const fire = vi.fn().mockResolvedValue(null);
    for (let i = 0; i < 3; i++) { advance(); await tasks.runDue(fire, new AbortController().signal); }
    expect(fire).toHaveBeenCalledTimes(2);
    expect(fire.mock.calls[0]?.[0]).toMatchObject({ mode: 'notify', runs: 0 });
  });
});

