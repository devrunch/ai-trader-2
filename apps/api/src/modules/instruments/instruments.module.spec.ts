import { Logger } from '@nestjs/common';
import { expect, it, vi } from 'vitest';
import { InstrumentsModule } from './instruments.module';
import { instrument, index, repository } from './application/instruments.spec-helper';

// FR-SY-6: an existing master is searchable before the next scheduled refresh.
it('loads the persisted master into the index on bootstrap', async () => {
  const repo = repository(); const searchIndex = index();
  const instruments = [instrument('NSE:NIFTY')];
  repo.listForIndex.mockResolvedValue(instruments);
  await new InstrumentsModule(repo, searchIndex).onApplicationBootstrap();
  expect(searchIndex.rebuild).toHaveBeenCalledExactlyOnceWith(instruments);
});
it('logs index startup storage failures without failing liveness', async () => {
  const repo = repository(); const searchIndex = index();
  repo.listForIndex.mockRejectedValue(new Error('storage unavailable'));
  const warning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  try {
    await expect(new InstrumentsModule(repo, searchIndex).onApplicationBootstrap()).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledWith('Unable to load persisted instrument search index');
    expect(searchIndex.rebuild).not.toHaveBeenCalled();
  } finally { warning.mockRestore(); }
});
