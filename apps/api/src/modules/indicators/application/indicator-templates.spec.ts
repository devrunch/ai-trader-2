import { beforeEach, describe, expect, it } from 'vitest';
import type { IndicatorTemplate, TemplateItem } from '@aitrader/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import { IndicatorTemplates, type TemplateStore } from './indicator-templates';

class MemoryStore implements TemplateStore {
  rows = new Map<string, IndicatorTemplate & { userId: string }>();
  private n = 0;
  list(userId: string) { return Promise.resolve([...this.rows.values()].filter(r => r.userId === userId)); }
  create(userId: string, name: string, items: TemplateItem[]) {
    const row = { id: `t${String(++this.n)}`, userId, name, favourite: false, items };
    this.rows.set(row.id, row);
    return Promise.resolve(row);
  }
  setFavourite(userId: string, id: string, favourite: boolean) {
    const row = this.rows.get(id);
    if (row?.userId !== userId) return Promise.resolve(null);
    row.favourite = favourite;
    return Promise.resolve(row);
  }
  remove(userId: string, id: string) { const mine = this.rows.get(id)?.userId === userId; if (mine) this.rows.delete(id); return Promise.resolve(mine); }
}

const check = (id: string) => { if (id !== 'sma' && id !== 'rsi') throw new NotFoundError('Unknown indicator', { id }); };
const sma: TemplateItem = { key: 'ind-1', id: 'sma', inputs: { length: 20 } };
const rsi: TemplateItem = { key: 'ind-2', id: 'rsi', inputs: { source: { from: 'ind-1', plot: 'ma' } } };

// FR-IN-14
describe('indicator templates', () => {
  let store: MemoryStore; let templates: IndicatorTemplates;
  beforeEach(() => { store = new MemoryStore(); templates = new IndicatorTemplates(store, check); });

  it('saves a set with source refs between its own items and lists it per user', async () => {
    const saved = await templates.create('u1', 'Trend', [sma, rsi]);
    expect(saved).toMatchObject({ name: 'Trend', favourite: false, items: [sma, rsi] });
    expect(await templates.list('u2')).toEqual([]);
  });

  it('rejects repeated names, repeated keys, unknown indicators and refs that leave the set', async () => {
    await templates.create('u1', 'Trend', [sma]);
    await expect(templates.create('u1', 'Trend', [sma])).rejects.toBeInstanceOf(ConflictError);
    await expect(templates.create('u1', 'Dup', [sma, sma])).rejects.toBeInstanceOf(ValidationError);
    await expect(templates.create('u1', 'Bad', [{ key: 'k', id: 'nope', inputs: {} }])).rejects.toBeInstanceOf(NotFoundError);
    await expect(templates.create('u1', 'Orphan', [rsi])).rejects.toBeInstanceOf(ValidationError);
  });

  it('caps a user at 30 templates', async () => {
    for (let i = 0; i < 30; i++) await templates.create('u1', `T${String(i)}`, [sma]);
    await expect(templates.create('u1', 'T30', [sma])).rejects.toBeInstanceOf(ValidationError);
  });

  it('marks favourites and deletes, each only for the owner', async () => {
    const { id } = await templates.create('u1', 'Trend', [sma]);
    expect((await templates.setFavourite('u1', id, true)).favourite).toBe(true);
    await expect(templates.setFavourite('u2', id, true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(templates.remove('u2', id)).rejects.toBeInstanceOf(NotFoundError);
    await templates.remove('u1', id);
    expect(await templates.list('u1')).toEqual([]);
  });
});
