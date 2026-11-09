import { expect, it, vi } from 'vitest';
import { ListInstrumentSources } from './list-instrument-sources';
import type { InstrumentRepository } from './ports/instrument-repository';

it('lists instrument source status from the repository (FR-AC-2)', async () => {
  const rows = [{ source: 'kite', status: 'ok', reason: null, count: 3, lastSuccessAt: '2026-11-09T01:00:00.000Z' }];
  const repository = { listSourceStatus: vi.fn().mockResolvedValue(rows) } as unknown as InstrumentRepository;
  expect(await new ListInstrumentSources(repository).execute()).toEqual(rows);
});
