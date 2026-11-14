import { describe, expect, it, vi } from 'vitest';
import { WhatToWatch, type StoredWatch, type WatchInputs, type WatchStore } from './what-to-watch';

function setup(draft: unknown, start = Date.parse('2026-11-16T03:00:00Z')) {
  let now = start;
  const lists: StoredWatch[] = [];
  const store: WatchStore = {
    latest: () => Promise.resolve(lists.at(-1) ?? null),
    recent: (_u, limit) => Promise.resolve(lists.slice(-limit)),
    save: (_u, list) => { const i = lists.findIndex(l => l.id === list.id); if (i >= 0) lists[i] = list; else lists.push(list); return Promise.resolve(); },
    open: () => Promise.resolve(lists.filter(l => l.items.some(i => i.outcome === 'open')).map(list => ({ userId: 'u1', list }))),
  };
  const prices = new Map([['NSE:RELIANCE', { price: 1340, changePct: 0.4 }], ['MCX:CRUDEOIL1!', { price: 6400, changePct: 1.2 }]]);
  const inputs: WatchInputs = {
    symbols: () => Promise.resolve(['NSE:RELIANCE', 'MCX:CRUDEOIL1!']),
    quotes: syms => Promise.resolve(new Map(syms.flatMap(s => { const q = prices.get(s); return q ? [[s, q] as const] : []; }))),
    headlines: () => Promise.resolve([{ title: 'Crude stocks fall', sources: 4, sentiment: 'bullish', symbols: ['MCX:CRUDEOIL1!'] }]),
    events: () => Promise.resolve([]),
  };
  const model = { draft: vi.fn(() => Promise.resolve(draft)) };
  const tasks = { create: vi.fn(() => Promise.resolve({ id: 'task-1' })) };
  let n = 0;
  const service = new WhatToWatch(store, inputs, model, tasks, { now: () => now, id: () => `id-${String(++n)}` });
  return { service, model, tasks, prices, lists, advance: (ms: number) => { now += ms; } };
}

const item = (over: Record<string, unknown> = {}) => ({ title: 'Reliance may follow crude higher', why: 'Crude is up 1.2% after a stock draw; Reliance usually follows.',
  symbols: ['NSE:RELIANCE'], direction: 'up', confidence: 0.6, horizon: 'today', follow: { symbol: 'NSE:RELIANCE', op: 'above', value: 1350 }, ...over });

describe('What to watch', () => {
  it('writes items from the data, keeps only symbols it has prices for, and records the price at writing', async () => {
    const { service, model } = setup({ items: [item(), item({ title: 'Invented stock to watch', symbols: ['NSE:MADEUP'], follow: null })] });
    const res = await service.refresh('u1');
    expect(res.list?.items).toHaveLength(1);
    expect(res.list?.items[0]).toMatchObject({ title: 'Reliance may follow crude higher', refPrices: { 'NSE:RELIANCE': 1340 }, outcome: 'open', taskId: null });
    expect(String((model.draft.mock.calls[0] as unknown[])[1])).toContain('Crude stocks fall');
  });

  it('drops a follow level that sits on the current price, since it would trigger on noise', async () => {
    const { service } = setup({ items: [item({ follow: { symbol: 'NSE:RELIANCE', op: 'below', value: 1340.5 } })] });
    expect((await service.refresh('u1')).list?.items[0]?.follow).toBeNull();
  });

  it('keeps a list younger than 30 minutes unless forced', async () => {
    const { service, model, advance } = setup({ items: [item()] });
    await service.refresh('u1');
    advance(10 * 60_000);
    await service.refresh('u1');
    expect(model.draft).toHaveBeenCalledTimes(1);
    await service.refresh('u1', true);
    expect(model.draft).toHaveBeenCalledTimes(2);
  });

  it('following an item creates a two-hour task with a plain title, once', async () => {
    const { service, tasks } = setup({ items: [item()] });
    const id = (await service.refresh('u1')).list?.items[0]?.id ?? '';
    const res = await service.follow('u1', id);
    expect(tasks.create).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Watching RELIANCE: breaks above 1350', expiresInDays: 2 / 24,
      trigger: { kind: 'price', symbol: 'NSE:RELIANCE', op: 'above', value: 1350 } }));
    expect(res.list?.items[0]?.taskId).toBe('task-1');
    await service.follow('u1', id);
    expect(tasks.create).toHaveBeenCalledTimes(1);
  });

  it('judges items when their time is up and keeps a track record', async () => {
    const { service, prices, advance } = setup({ items: [item()] });
    await service.refresh('u1');
    expect(await service.judgeDue()).toBe(0);
    prices.set('NSE:RELIANCE', { price: 1352, changePct: 1.3 });
    advance(8 * 3_600_000);
    expect(await service.judgeDue()).toBe(1);
    const res = await service.get('u1');
    expect(res.list?.items[0]).toMatchObject({ outcome: 'right', movePct: 0.9 });
    expect(res.list?.record).toEqual({ right: 1, wrong: 0, total: 1 });
  });

  it('refuses a draft that names no symbol it has prices for', async () => {
    const { service } = setup({ items: [item({ symbols: ['NSE:MADEUP'], follow: null })] });
    await expect(service.refresh('u1')).rejects.toThrow('No usable items');
  });
});
