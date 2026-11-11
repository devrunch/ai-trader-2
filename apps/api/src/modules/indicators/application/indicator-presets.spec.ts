import { beforeEach, describe, expect, it } from 'vitest';
import type { IndicatorPreset } from '@aitrader/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import { IndicatorPresets, type PresetStore } from './indicator-presets';

class MemoryStore implements PresetStore {
  rows = new Map<string, IndicatorPreset & { userId: string }>();
  private n = 0;
  list(userId: string) { return Promise.resolve([...this.rows.values()].filter(r => r.userId === userId)); }
  saveDefault(userId: string, indicatorId: string, inputs: IndicatorPreset['inputs']) {
    const found = [...this.rows.values()].find(r => r.userId === userId && r.indicatorId === indicatorId && r.name === null);
    if (found) { found.inputs = inputs; return Promise.resolve(found); }
    return this.create(userId, indicatorId, null, inputs);
  }
  create(userId: string, indicatorId: string, name: string | null, inputs: IndicatorPreset['inputs']) {
    const row = { id: `p${String(++this.n)}`, userId, indicatorId, name, inputs };
    this.rows.set(row.id, row);
    return Promise.resolve(row);
  }
  remove(userId: string, id: string) { const mine = this.rows.get(id)?.userId === userId; if (mine) this.rows.delete(id); return Promise.resolve(mine); }
}

const check = (id: string, inputs: Record<string, unknown>) => {
  if (id !== 'sma') throw new NotFoundError('Unknown indicator', { id });
  if (typeof inputs.length === 'number' && inputs.length < 1) throw new ValidationError('Input "length": must be at least 1', { input: 'length' });
};

// FR-IN-12
describe('indicator presets', () => {
  let store: MemoryStore; let presets: IndicatorPresets;
  beforeEach(() => { store = new MemoryStore(); presets = new IndicatorPresets(store, check); });

  it('keeps one default per indicator and replaces it on a second save', async () => {
    await presets.saveDefault('u1', 'sma', { length: 20 });
    await presets.saveDefault('u1', 'sma', { length: 50 });
    const list = await presets.list('u1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ indicatorId: 'sma', name: null, inputs: { length: 50 } });
  });

  it('saves named presets, refusing a repeated name for the same indicator', async () => {
    await presets.create('u1', 'sma', 'Slow', { length: 200 });
    await expect(presets.create('u1', 'sma', 'Slow', { length: 100 })).rejects.toBeInstanceOf(ConflictError);
    expect(await presets.list('u2')).toEqual([]);
  });

  it('rejects unknown indicators and out-of-range inputs before saving', async () => {
    await expect(presets.create('u1', 'nope', 'X', {})).rejects.toBeInstanceOf(NotFoundError);
    await expect(presets.saveDefault('u1', 'sma', { length: 0 })).rejects.toBeInstanceOf(ValidationError);
    expect(store.rows.size).toBe(0);
  });

  it('caps a user at 50, but still lets an existing default be replaced', async () => {
    await presets.saveDefault('u1', 'sma', { length: 9 });
    for (let i = 1; i < 50; i++) await presets.create('u1', 'sma', `P${String(i)}`, { length: i });
    await expect(presets.create('u1', 'sma', 'One more', {})).rejects.toBeInstanceOf(ValidationError);
    await expect(presets.saveDefault('u1', 'sma', { length: 10 })).resolves.toMatchObject({ inputs: { length: 10 } });
  });

  it('deletes only the owner preset', async () => {
    const { id } = await presets.create('u1', 'sma', 'Mine', {});
    await expect(presets.remove('u2', id)).rejects.toBeInstanceOf(NotFoundError);
    await presets.remove('u1', id);
    expect(await presets.list('u1')).toEqual([]);
  });
});
