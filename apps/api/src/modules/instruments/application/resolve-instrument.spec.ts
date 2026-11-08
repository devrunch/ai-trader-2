import { describe, expect, it } from 'vitest';
import { ResolveInstrument } from './resolve-instrument.js';
import { index, instrument, repository } from './instruments.spec-helper.js';

function setup() {
  const repo = repository(); const search = index();
  return { repo, search, resolve: new ResolveInstrument(repo, search, () => new Date('2026-11-09T00:00:00Z')) };
}
describe('FR-SY-5/7, E23 instrument resolution', () => {
  it('resolves a renamed instrument through its change history', async () => {
    const { resolve, repo } = setup(); const successor = instrument('NSE:NEW');
    repo.findById.mockResolvedValueOnce(instrument('NSE:OLD', { status: 'delisted' })).mockResolvedValueOnce(successor);
    repo.findRenameSuccessor.mockResolvedValueOnce('NSE:NEW');
    expect(await resolve.execute('NSE:OLD')).toEqual({ instrument: successor, via: 'renamed', resolvedFrom: 'NSE:OLD' });
  });
  it('rename chains stop after 5 hops and are cycle-safe', async () => {
    const { resolve, repo } = setup();
    repo.findById.mockImplementation(id => Promise.resolve(instrument(id, { status: 'delisted' })));
    repo.findRenameSuccessor.mockImplementation(id => Promise.resolve(`NSE:${String(Number(id.split(':')[1]) + 1)}`));
    expect((await resolve.execute('NSE:0')).instrument.id.toString()).toBe('NSE:5');
    expect(repo.findRenameSuccessor).toHaveBeenCalledTimes(5);
    repo.findRenameSuccessor.mockClear().mockResolvedValue('NSE:0');
    expect((await resolve.execute('NSE:0')).instrument.id.toString()).toBe('NSE:0');
    expect(repo.findRenameSuccessor).toHaveBeenCalledOnce();
  });
  it('delisted ids resolve with status delisted', async () => {
    const { resolve, repo } = setup(); repo.findById.mockResolvedValue(instrument('NSE:OLD', { status: 'delisted' }));
    expect(await resolve.execute('NSE:OLD')).toEqual({ instrument: instrument('NSE:OLD', { status: 'delisted' }) });
  });
  it('continuous ids resolve to the front contract', async () => {
    const { resolve, repo } = setup(); const front = instrument('MCX:GOLDNOV', { type: 'commodity', expiry: '2026-11-25' });
    repo.listContinuousCandidates.mockResolvedValue([front]);
    expect(await resolve.execute('MCX:GOLD1!')).toEqual({ instrument: front, via: 'continuous', resolvedFrom: 'MCX:GOLD1!' });
    expect(repo.listContinuousCandidates).toHaveBeenCalledWith('GOLD', 'MCX');
  });
  it('unknown ids raise SYMBOL_NOT_FOUND with suggestions', async () => {
    const { resolve, search } = setup(); search.suggest.mockReturnValue([instrument('NSE:NEW').id]);
    await expect(resolve.execute('NSE:TYPO')).rejects.toMatchObject({ code: 'SYMBOL_NOT_FOUND', httpStatus: 404, details: { id: 'NSE:TYPO', suggestions: ['NSE:NEW'] } });
    expect(search.suggest).toHaveBeenCalledWith('TYPO', 5);
  });
  it('invalid ids raise VALIDATION_FAILED', async () => {
    await expect(setup().resolve.execute('invalid')).rejects.toMatchObject({ code: 'VALIDATION_FAILED', httpStatus: 422 });
  });
  it('continuous ids without an unexpired contract raise SYMBOL_NOT_FOUND', async () => {
    await expect(setup().resolve.execute('MCX:GOLD1!')).rejects.toMatchObject({ code: 'SYMBOL_NOT_FOUND', httpStatus: 404 });
  });
  it('returns active suspended and expired ids and retains a row when a successor is missing', async () => {
    const { resolve, repo } = setup();
    for (const status of ['active', 'suspended', 'expired', 'delisted'] as const) {
      repo.findById.mockResolvedValueOnce(instrument('NSE:OLD', { status }));
      repo.findRenameSuccessor.mockResolvedValue('NSE:MISSING');
      expect((await resolve.execute('NSE:OLD')).instrument.status).toBe(status);
    }
  });
});

// FR-SY-7, E23
it('a purged expired id reports reason expired with its date', async () => {
  const repo = repository();
  const searchIndex = index();
  repo.findLastChange.mockResolvedValue({ id: instrument('NFO:OLD').id, kind: 'expired', at: '2026-09-01T00:00:00Z' });
  const resolve = new ResolveInstrument(repo, searchIndex);
  await expect(resolve.execute('NFO:OLD')).rejects.toMatchObject({
    code: 'SYMBOL_NOT_FOUND', details: { id: 'NFO:OLD', reason: 'expired', at: '2026-09-01T00:00:00Z', suggestions: [] },
  });
});

// FR-SY-7, E23
it('a purged delisted id reports reason delisted with its date', async () => {
  const repo = repository();
  repo.findLastChange.mockResolvedValue({ id: instrument('NSE:OLD').id, kind: 'delisted', at: '2026-09-01T00:00:00Z' });
  await expect(new ResolveInstrument(repo, index()).execute('NSE:OLD')).rejects.toMatchObject({
    code: 'SYMBOL_NOT_FOUND', details: { id: 'NSE:OLD', reason: 'delisted', at: '2026-09-01T00:00:00Z', suggestions: [] },
  });
});
