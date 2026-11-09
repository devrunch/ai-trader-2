import { describe, expect, it, vi } from 'vitest';
import { DailyDataReport, OpsWatch, ZerodhaReminder } from './alert-jobs';

const ist = (iso: string) => Date.parse(`${iso}+05:30`);
function notifier() { return { configured: true, recipients: ['o@example.com'], send: vi.fn().mockResolvedValue('sent') }; }
function gate(open = true) { return { open: vi.fn().mockResolvedValue(open) }; }

describe('ZerodhaReminder', () => {
  it('emails the connect link on a trading morning when Zerodha is not connected', async () => {
    const n = notifier();
    await new ZerodhaReminder({ status: () => Promise.resolve({ valid: false }) }, n, gate(), 'http://localhost:5173', () => ist('2026-11-11T08:45:00')).run();
    expect(n.send).toHaveBeenCalledWith({ subject: 'Zerodha not connected', text: expect.stringContaining('http://localhost:5173/admin?tab=zerodha') as string });
  });

  it('stays quiet when connected, on holidays and on weekends', async () => {
    const n = notifier();
    const check = (at: string, valid: boolean) => new ZerodhaReminder({ status: () => Promise.resolve({ valid }) }, n, gate(), 'http://x', () => ist(at)).run();
    await check('2026-11-11T08:45:00', true);
    await check('2026-11-10T08:45:00', false); // Diwali Balipratipada
    await check('2026-11-14T08:45:00', false); // Saturday
    expect(n.send).not.toHaveBeenCalled();
  });
});

describe('DailyDataReport', () => {
  it('sends the report for today when anything was checked', async () => {
    const n = notifier();
    const coverage = { execute: vi.fn().mockResolvedValue([{ instrumentId: 'NSE:NIFTY', calendarId: 'NSE', repairedGaps: 0,
      session: { open: ist('2026-11-11T09:15:00'), close: ist('2026-11-11T15:30:00') },
      coverage: { expected: 375, stored: 375, gaps: [], endsAt: ist('2026-11-11T15:30:00') } }]) };
    await new DailyDataReport(coverage, n, () => ist('2026-11-11T15:50:00')).run();
    expect(coverage.execute).toHaveBeenCalledWith('2026-11-11', expect.any(AbortSignal));
    expect(n.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Data report 2026-11-11: all complete' }));
  });

  it('sends nothing on a day with no data', async () => {
    const n = notifier();
    await new DailyDataReport({ execute: vi.fn().mockResolvedValue([]) }, n, () => ist('2026-11-10T15:50:00')).run();
    expect(n.send).not.toHaveBeenCalled();
  });
});

describe('OpsWatch', () => {
  const now = ist('2026-11-11T11:00:00');
  const deps = (over: Partial<ConstructorParameters<typeof OpsWatch>[0]> = {}) => ({
    jobs: { list: () => [{ name: 'bars-backfill' }], lastRun: vi.fn().mockResolvedValue({ at: new Date(now - 120_000).toISOString(), outcome: 'failed' }) },
    feeds: { state: vi.fn().mockResolvedValue({ state: 'live', at: now }) },
    notifier: notifier(), gate: gate(), clock: () => now, ...over,
  });

  it('emails a job that failed since the last check', async () => {
    const d = deps();
    await new OpsWatch(d).run();
    expect(d.notifier.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Job failed: bars-backfill' }));
  });

  it('emails a feed down for 5 minutes during its market hours, once per gate window', async () => {
    const d = deps({ jobs: { list: () => [], lastRun: vi.fn() }, feeds: { state: vi.fn((vendor: string) => Promise.resolve(vendor === 'kite' ? { state: 'reconnecting', at: now - 6 * 60_000 } : { state: 'live', at: now })) } });
    await new OpsWatch(d).run();
    expect(d.notifier.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Feed down: kite (reconnecting)' }));
    expect(d.gate.open).toHaveBeenCalledWith('feed:kite', 3_600_000);
  });

  it('a feed down outside its market hours is not an alert', async () => {
    const night = ist('2026-11-11T22:00:00');
    const d = deps({ clock: () => night, jobs: { list: () => [], lastRun: vi.fn() }, feeds: { state: vi.fn((vendor: string) => Promise.resolve(vendor === 'kite' ? { state: 'stale', at: night - 3_600_000 } : { state: 'live', at: night })) } });
    await new OpsWatch(d).run();
    expect(d.notifier.send).not.toHaveBeenCalled();
  });
});
