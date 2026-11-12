import { describe, expect, it, vi } from 'vitest';
import type { AgentTask } from '../domain/agent-task';
import { BackgroundRuns } from './agent-trader';
import { TaskFirer, TransientRunError } from './task-firer';

const base: AgentTask = { id: 't', userId: 'u1', threadId: 'th1', mode: 'agent', title: 'Breakout', instruction: 'buy', state: 'active', runs: 0, maxRuns: 1, armed: false,
  trigger: { kind: 'price', symbol: 'NSE:INFY', op: 'above', value: 1500 }, lastRunAt: null, nextRunAt: null, lastError: null, lastOutcome: null, autoTrade: null, desk: null,
  runState: 'running', runStateAt: 0, pendingFire: { key: 'k', reason: 'r' }, seen: [], expiresAt: 0, createdAt: 0 };
const watchTask: AgentTask = { ...base, title: 'News: india (high+)', instruction: 'Does it matter?', trigger: { kind: 'news', markets: ['india'], symbols: [], keywords: [], minImpact: 'high' } };
const signal = new AbortController().signal;

function setup(reply: { error: string | null; reply: string }, allow = true) {
  const chat = { runInBackground: vi.fn().mockResolvedValue(reply) };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  const limiter = { take: vi.fn().mockResolvedValue(allow) };
  const desk = { fire: vi.fn().mockResolvedValue({ error: null, outcome: 'silent' }) };
  const firer = new TaskFirer(chat as never, notifications, { limiter, dailyRuns: 40, now: () => 86_400_000 * 5 }, new BackgroundRuns(), desk as never);
  return { firer, chat, notifications, limiter, desk };
}

describe('TaskFirer', () => {
  it('an assistant task runs in its thread and notifies with the reply, with no cap check', async () => {
    const { firer, chat, notifications, limiter } = setup({ error: null, reply: 'Bought.' });
    expect(await firer.fire(base, 'NSE:INFY price is 1505', signal)).toEqual({ error: null, outcome: 'ran' });
    expect(chat.runInBackground).toHaveBeenCalledWith('u1', 'th1', expect.stringContaining('buy'));
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'task', title: 'Task "Breakout" ran', link: { threadId: 'th1' } }));
    expect(limiter.take).not.toHaveBeenCalled();
  });

  it('a watch reply starting REPORT: notifies; SILENT: or anything else does not', async () => {
    const report = setup({ error: null, reply: 'REPORT: RBI cut the repo rate\nBanks should rally.' });
    expect(await report.firer.fire(watchTask, 'x', signal)).toEqual({ error: null, outcome: 'report' });
    expect(report.notifications.notify).toHaveBeenCalledExactlyOnceWith({ userId: 'u1', kind: 'task', title: 'Watch: News: india (high+)', body: 'RBI cut the repo rate\nBanks should rally.', link: { threadId: 'th1' } });
    const silent = setup({ error: null, reply: 'SILENT: routine' });
    expect(await silent.firer.fire(watchTask, 'x', signal)).toEqual({ error: null, outcome: 'silent' });
    expect(silent.notifications.notify).not.toHaveBeenCalled();
  });

  it('enforces the daily watch cap when the run starts, without waking the assistant', async () => {
    const { firer, chat, notifications, limiter } = setup({ error: null, reply: 'REPORT: x' }, false);
    expect(await firer.fire(watchTask, 'x', signal)).toEqual({ error: null, outcome: 'capped' });
    expect(limiter.take).toHaveBeenCalledWith('watch:u1:5', 40, 86_400_000);
    expect(chat.runInBackground).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('a desk task goes to the desk runner (which has its own daily cap)', async () => {
    const { firer, desk, chat } = setup({ error: null, reply: '' });
    await firer.fire({ ...watchTask, desk: { symbol: 'NSE:INFY', rounds: 1 } }, 'x', signal);
    expect(desk.fire).toHaveBeenCalledOnce();
    expect(chat.runInBackground).not.toHaveBeenCalled();
  });

  it('throws a transient error for a model or network failure so the queue retries, and returns a plain refusal', async () => {
    await expect(setup({ error: 'fetch failed', reply: '' }).firer.fire(base, 'x', signal)).rejects.toBeInstanceOf(TransientRunError);
    await expect(setup({ error: 'upstream 503', reply: '' }).firer.fire(base, 'x', signal)).rejects.toBeInstanceOf(TransientRunError);
    const refused = setup({ error: 'Daily assistant limit reached', reply: '' });
    expect(await refused.firer.fire(base, 'x', signal)).toEqual({ error: 'Daily assistant limit reached', outcome: 'error' });
  });
});
