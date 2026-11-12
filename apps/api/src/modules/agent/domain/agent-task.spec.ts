import { describe, expect, it } from 'vitest';
import { afterRun, nextScheduled, tick, type AgentTask } from './agent-task';

const t0 = Date.parse('2026-11-11T03:45:00Z'); // 09:15 IST
const task = (patch: Partial<AgentTask> = {}): AgentTask => ({
  id: 't', userId: 'u', threadId: 'th', mode: 'agent', title: 'Breakout', instruction: 'buy', state: 'active', runs: 0, maxRuns: 1, armed: true,
  trigger: { kind: 'price', symbol: 'NSE:INFY', op: 'above', value: 1500 }, lastRunAt: null, nextRunAt: null, lastError: null, lastOutcome: null, autoTrade: null, desk: null, runState: 'idle' as const, runStateAt: null, pendingFire: null, seen: [],
  expiresAt: t0 + 86_400_000, createdAt: t0, ...patch,
});

describe('background task triggers', () => {
  it('a price condition fires once on the cross, then waits for it to reset', () => {
    const first = tick(task(), t0, 1501);
    expect(first).toMatchObject({ fire: true, reason: 'NSE:INFY price is 1501, above 1500' });
    const still = tick(first.task, t0 + 60_000, 1502);
    expect(still.fire).toBe(false);
    const reset = tick(still.task, t0 + 120_000, 1499);
    expect(tick(reset.task, t0 + 180_000, 1503).fire).toBe(true);
  });

  it('a condition already true when created waits for a real cross', () => {
    const created = task({ armed: false });
    expect(tick(created, t0, 1510).fire).toBe(false);
    expect(tick(tick(created, t0, 1490).task, t0 + 60_000, 1505).fire).toBe(true);
  });

  it('no data is no decision', () => {
    expect(tick(task(), t0, undefined)).toEqual({ fire: false, task: task() });
  });

  it('schedules fire when due and move to the next time; faster than every 5 minutes is refused', () => {
    const daily = { kind: 'schedule' as const, cron: '30 9 * * 1-5', tz: 'Asia/Kolkata' };
    const next = nextScheduled(daily, t0);
    expect(new Date(next).toISOString()).toBe('2026-11-11T04:00:00.000Z');
    const due = tick(task({ trigger: daily, nextRunAt: next }), next);
    expect(due).toMatchObject({ fire: true });
    expect(due.task.nextRunAt).toBe(Date.parse('2026-11-12T04:00:00.000Z'));
    expect(() => nextScheduled({ kind: 'schedule', cron: '* * * * *', tz: 'Asia/Kolkata' }, t0)).toThrow('every 5 minutes');
    expect(() => nextScheduled({ kind: 'schedule', cron: 'not cron', tz: 'Asia/Kolkata' }, t0)).toThrow('valid cron');
  });

  it('expires, and finishes when its runs are spent', () => {
    expect(tick(task(), t0 + 86_400_000, 1501)).toMatchObject({ fire: false, task: { state: 'expired' } });
    expect(afterRun(task({ maxRuns: 2 }), t0, null)).toMatchObject({ runs: 1, state: 'active' });
    expect(afterRun(task({ maxRuns: 1 }), t0, 'boom')).toMatchObject({ runs: 1, state: 'done', lastError: 'boom' });
  });
});
