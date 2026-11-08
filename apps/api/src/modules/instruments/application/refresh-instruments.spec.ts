import { describe, expect, it, vi } from 'vitest';
import { RefreshInstruments } from './refresh-instruments.js';
import type { InstrumentSource } from './ports/instrument-source.js';
import { index, instrument, repository } from './instruments.spec-helper.js';

const clock = () => new Date('2026-11-08T20:00:00Z');
const signal = () => new AbortController().signal;
function setup() {
  const repo = repository(); const search = index(); const logger = { warn: vi.fn() };
  const sources: InstrumentSource[] = ['kite', 'deriv', 'nasdaq'].map((name) => {
    if (name !== 'kite' && name !== 'deriv' && name !== 'nasdaq') throw new Error(name);
    return { name, fetch: vi.fn().mockResolvedValue({ instruments: [instrument()], mappings: [] }) };
  });
  return { repo, search, sources, logger, refresh: new RefreshInstruments(repo, sources, search, clock, logger) };
}
describe('FR-SY-2/3/4, NFR-RB-4/5 independent refresh', () => {
  it('a failed source keeps the previous master and records stale', async () => {
    const { sources, repo, refresh, logger } = setup();
    const nasdaq = sources[2]; if (!nasdaq) throw new Error('missing source');
    nasdaq.fetch = vi.fn().mockRejectedValue(new Error('Nasdaq unavailable'));
    const report = await refresh.execute(signal());
    expect(repo.applySource.mock.calls.map(([source]) => source)).toEqual(['kite', 'deriv']);
    expect(repo.loadSource).not.toHaveBeenCalledWith('nasdaq');
    expect(repo.setSourceStatus).toHaveBeenCalledWith('nasdaq', { status: 'stale', reason: 'Nasdaq unavailable', at: clock().toISOString() });
    expect(report.sources.nasdaq).toMatchObject({ status: 'stale', reason: 'Nasdaq unavailable' });
    expect(logger.warn).toHaveBeenCalledOnce();
  });
  it('refresh rebuilds the search index once after all sources', async () => {
    const { refresh, repo, search } = setup();
    repo.listForIndex.mockResolvedValue([instrument()]);
    await refresh.execute(signal());
    expect(search.rebuild).toHaveBeenCalledExactlyOnceWith([instrument()]);
    expect(repo.applySource.mock.invocationCallOrder.at(-1)).toBeLessThan(search.rebuild.mock.invocationCallOrder[0] ?? 0);
  });
  it('refresh purges expired derivatives older than 30 days', async () => {
    const { refresh, repo } = setup(); await refresh.execute(signal());
    expect(repo.purgeExpired).toHaveBeenCalledExactlyOnceWith('2026-10-10');
  });
  it('records apply failures and truncates stale reasons to 200 characters', async () => {
    const { refresh, repo } = setup(); repo.applySource.mockRejectedValueOnce(new Error('x'.repeat(250)));
    const report = await refresh.execute(signal());
    expect(report.sources.kite?.reason).toBe('x'.repeat(200));
    expect(report.sources.deriv?.status).toBe('ok');
  });
  it('uses exchange scoped Kite identities and disables identity for other sources', async () => {
    const { refresh, repo, sources } = setup();
    const kite = sources[0]; if (!kite) throw new Error('missing Kite');
    kite.identity = mappings => {
      const keys = new Map(mappings.map(m => [m.id, m.providerToken?.split('/')[0]]));
      return i => `${i.exchange}|${keys.get(String(i.id)) ?? ''}`;
    };
    repo.loadSource.mockResolvedValue({ instruments: [instrument()], mappings: [{ id: 'NSE:OLD', provider: 'kite', providerSymbol: 'OLD', providerToken: '1/2' }] });
    for (const source of sources) source.fetch = () => Promise.resolve({ instruments: [instrument('NSE:NEW')], mappings: [{ id: 'NSE:NEW', provider: 'kite', providerSymbol: 'NEW', providerToken: '1/3' }] });
    const report = await refresh.execute(signal());
    expect(report.sources.kite?.changes.renamed).toBe(1);
    expect(report.sources.deriv?.changes.renamed).toBe(0);
    expect(report.sources.nasdaq?.changes.delisted).toBe(1);
  });
});
