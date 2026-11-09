import { describe, expect, it, vi } from 'vitest';
import { OpsOverview, type OpsPorts } from './ops-overview.js';

function ports(overrides: Partial<OpsPorts> = {}): OpsPorts {
  return {
    feedStates: { get: vi.fn().mockResolvedValue({ state: 'live', at: 5 }) },
    leadership: { leader: vi.fn().mockResolvedValue({ instanceId: 'md-1', ttlMs: 9000 }), subscriptions: vi.fn().mockResolvedValue([{ instrumentId: 'NSE:A', count: 1 }]) },
    jobs: {
      list: vi.fn().mockReturnValue([{ name: 'instruments-refresh', cron: '0 7 * * *', tz: 'Asia/Kolkata', next: '2026-11-10T01:30:00.000Z' }]),
      lastRun: vi.fn().mockResolvedValue({ at: '2026-11-09T01:30:00.000Z', scheduledAt: null, outcome: 'ok' }),
      has: vi.fn((name: string) => name === 'instruments-refresh'),
      runNow: vi.fn().mockResolvedValue(undefined),
    },
    sources: { list: vi.fn().mockResolvedValue([{ source: 'kite', status: 'ok', reason: null, count: 3, lastSuccessAt: '2026-11-09T01:31:00+00:00' }, { source: 'deriv', status: 'stale', reason: 'down', count: 2, lastSuccessAt: null }]) },
    ...overrides,
  };
}

describe('OpsOverview (FR-AC-2)', () => {
  it('feeds lists every vendor, the leader and subscriptions', async () => {
    const result = await new OpsOverview(ports()).feeds();
    expect(result.vendors.map(vendor => vendor.vendor)).toEqual(['kite', 'deriv', 'us-delayed']);
    expect(result.leader).toEqual({ instanceId: 'md-1', ttlMs: 9000 });
    expect(result.subscriptions).toEqual([{ instrumentId: 'NSE:A', count: 1 }]);
  });

  it('jobs carry their last run without the internal scheduledAt', async () => {
    const [job] = await new OpsOverview(ports()).jobs();
    expect(job).toEqual({ name: 'instruments-refresh', cron: '0 7 * * *', tz: 'Asia/Kolkata', next: '2026-11-10T01:30:00.000Z', lastRun: { at: '2026-11-09T01:30:00.000Z', outcome: 'ok' } });
  });

  it('runJob returns false for an unknown job and never triggers it', async () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const p = ports(); p.jobs = { ...p.jobs, runNow };
    expect(await new OpsOverview(p).runJob('nope')).toBe(false);
    expect(runNow).not.toHaveBeenCalled();
    expect(await new OpsOverview(p).runJob('instruments-refresh')).toBe(true);
    expect(runNow).toHaveBeenCalledWith('instruments-refresh');
  });

  it('instruments omit null reasons and total the counts', async () => {
    const result = await new OpsOverview(ports()).instruments();
    expect(result.total).toBe(5);
    expect(result.sources[0]).toEqual({ source: 'kite', status: 'ok', count: 3, lastSuccessAt: '2026-11-09T01:31:00+00:00' });
    expect(result.sources[1]?.reason).toBe('down');
  });

  it('refreshInstruments runs the instruments job', async () => {
    const runNow = vi.fn().mockResolvedValue(undefined);
    const p = ports(); p.jobs = { ...p.jobs, runNow };
    await new OpsOverview(p).refreshInstruments();
    expect(runNow).toHaveBeenCalledWith('instruments-refresh');
  });
});
