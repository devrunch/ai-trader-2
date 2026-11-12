import type { BacktestResult, BacktestSpec } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../domain/spec-fingerprint';
import { fingerprint, Strategies, type StoredStrategy, type StrategyStore } from './strategies';

const spec: BacktestSpec = { symbol: 'NSE:INFY', interval: '5', bars: 2000, indicators: [{ name: 'ema20', indicatorId: 'ema', inputs: { length: 20 } }],
  strategy: { side: 'long', entry: { kind: 'compare', left: { kind: 'series', name: 'close' }, op: 'crossesAbove', right: { kind: 'series', name: 'ema20' } }, stopLoss: { kind: 'percent', percent: 1 } },
  costs: { commissionPct: 0.03, slippagePct: 0.02 } };
const result = { metrics: { tradeCount: 30 } } as unknown as BacktestResult;

function memory(): StrategyStore & { rows: Map<string, StoredStrategy> } {
  const rows = new Map<string, StoredStrategy>();
  const mine = (userId: string, id: string) => (rows.get(id)?.userId === userId ? rows.get(id) : undefined);
  return { rows,
    list: userId => Promise.resolve([...rows.values()].filter(r => r.userId === userId)),
    get: (userId, id) => Promise.resolve(mine(userId, id) ?? null),
    count: userId => Promise.resolve([...rows.values()].filter(r => r.userId === userId).length),
    insert: row => { rows.set(row.id, row); return Promise.resolve(); },
    update: (userId, id, patch) => { const r = mine(userId, id); if (!r) return Promise.resolve(false); rows.set(id, { ...r, ...(patch.name ? { name: patch.name } : {}), ...(patch.spec ? { spec: patch.spec } : {}), updatedAt: patch.updatedAt }); return Promise.resolve(true); },
    remove: (userId, id) => Promise.resolve(mine(userId, id) ? rows.delete(id) : false),
    addVariant: (userId, id, hash) => { const r = mine(userId, id); if (!r) return Promise.resolve(null); const hashes = r.variantHashes.includes(hash) ? r.variantHashes : [...r.variantHashes, hash]; rows.set(id, { ...r, variantHashes: hashes }); return Promise.resolve(hashes.length); } };
}

function setup() {
  const store = memory();
  let n = 0;
  const runner = { run: vi.fn().mockResolvedValue(result) };
  return { store, runner, strategies: new Strategies(store, runner, { id: () => `00000000-0000-4000-8000-00000000000${String(++n)}`, now: () => new Date('2026-11-12T04:00:00Z') }) };
}
const withBars = (bars: number): BacktestSpec => ({ ...spec, bars });

describe('spec fingerprint', () => {
  it('is the same for the same parameters whatever the key order, and differs when any parameter changes', () => {
    const reordered = JSON.parse(JSON.stringify({ costs: spec.costs, strategy: spec.strategy, indicators: spec.indicators, bars: spec.bars, interval: spec.interval, symbol: spec.symbol })) as BacktestSpec;
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
    expect(fingerprint(reordered)).toBe(fingerprint(spec));
    expect(fingerprint(withBars(1000))).not.toBe(fingerprint(spec));
    expect(fingerprint({ ...spec, strategy: { ...spec.strategy, stopLoss: { kind: 'percent', percent: 2 } } })).not.toBe(fingerprint(spec));
    expect(fingerprint({ ...spec, costs: { commissionPct: 0.05, slippagePct: 0.02 } })).not.toBe(fingerprint(spec));
  });
});

describe('Strategies', () => {
  it('counts a variant for each new parameter set run against a saved strategy, and not for a repeat', async () => {
    const { strategies } = setup();
    const saved = await strategies.create('u1', { name: 'EMA cross', spec });
    expect(saved.variants).toBe(0);
    expect((await strategies.run('u1', { strategyId: saved.id, spec })).variants).toBe(1);
    expect((await strategies.run('u1', { strategyId: saved.id, spec })).variants).toBe(1);
    expect((await strategies.run('u1', { strategyId: saved.id, spec: withBars(1000) })).variants).toBe(2);
    expect((await strategies.run('u1', { strategyId: saved.id, spec: withBars(3000) })).variants).toBe(3);
    expect((await strategies.run('u1', { strategyId: saved.id, spec: withBars(1000) })).variants).toBe(3);
    expect((await strategies.list('u1')).items[0]).toMatchObject({ variants: 3 });
  });

  it('an unsaved run counts nothing, and a failed run is not a variant that was tried', async () => {
    const { strategies, runner } = setup();
    expect(await strategies.run('u1', { spec })).toMatchObject({ variants: null });
    const saved = await strategies.create('u1', { name: 'x', spec });
    runner.run.mockRejectedValueOnce(new Error('compute down'));
    await expect(strategies.run('u1', { strategyId: saved.id, spec: withBars(500) })).rejects.toThrow('compute down');
    expect((await strategies.list('u1')).items[0]?.variants).toBe(0);
  });

  it('keeps each user\'s strategies private, and caps how many one user can save', async () => {
    const { strategies, runner } = setup();
    const saved = await strategies.create('u1', { name: 'mine', spec });
    await expect(strategies.run('u2', { strategyId: saved.id, spec })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(runner.run).not.toHaveBeenCalled();
    await expect(strategies.update('u2', saved.id, { name: 'stolen' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(strategies.remove('u2', saved.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await strategies.list('u2')).items).toEqual([]);
    for (let i = 1; i < 50; i++) await strategies.create('u1', { name: `s${String(i)}`, spec });
    await expect(strategies.create('u1', { name: 'one too many', spec })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('renames and updates the spec without counting a variant until it is run', async () => {
    const { strategies } = setup();
    const saved = await strategies.create('u1', { name: 'a', spec });
    await strategies.run('u1', { strategyId: saved.id, spec });
    const updated = await strategies.update('u1', saved.id, { name: 'b', spec: withBars(1000) });
    expect(updated).toMatchObject({ name: 'b', variants: 1, spec: { bars: 1000 } });
    expect(await strategies.remove('u1', saved.id)).toEqual({ deleted: true });
  });
});
