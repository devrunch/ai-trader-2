import type { IndicatorDefinition, IndicatorResult } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ConflictError, ValidationError } from '../../../shared/errors';
import { ActionCards, type ActionCardStore } from './action-cards';
import { buildActionTools, buildIndicatorTools } from './action-tools';
import type { ActionCard } from '../domain/action-card';

const rsi: IndicatorDefinition = {
  ref: 'builtin:rsi@1', id: 'rsi', version: 1, name: 'Relative Strength Index', shortName: 'RSI', overlay: false,
  inputs: [{ id: 'length', title: 'Length', type: 'int', default: 14, min: 1, max: 500 }, { id: 'source', title: 'Source', type: 'string', default: 'close', options: ['close', 'open'] }],
  plots: [{ id: 'rsi', title: 'RSI', kind: 'line', color: 'violet', lineWidth: 1 }], levels: [],
};
const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };

function memoryStore(): ActionCardStore & { rows: Map<string, ActionCard> } {
  const rows = new Map<string, ActionCard>();
  return { rows, create: c => { rows.set(c.id, c); return Promise.resolve(); }, save: (c, from) => { if (rows.get(c.id)?.state !== from) return Promise.resolve(false); rows.set(c.id, c); return Promise.resolve(true); },
    get: (userId, id) => Promise.resolve(rows.get(id)?.userId === userId ? rows.get(id) ?? null : null) };
}

describe('action cards (FR-AG-17)', () => {
  let now = Date.parse('2026-11-10T10:00:00Z');
  const setup = () => { const store = memoryStore(); return { store, cards: new ActionCards(store, () => [rsi], { now: () => now, id: () => '00000000-0000-4000-8000-000000000001' }) }; };

  it('the propose tool only records a pending card for the caller', async () => {
    const { store, cards } = setup();
    const [tool] = buildActionTools(cards, deps);
    const result = await tool?.call(ctx, { kind: 'add-indicator', indicatorId: 'rsi', inputs: { length: 21 } });
    expect(result).toMatchObject({ ok: true, data: { state: 'pending', action: { indicatorId: 'rsi', inputs: { length: 21 } } } });
    expect([...store.rows.values()][0]?.userId).toBe('u1');
  });

  it('refuses unknown indicators and bad inputs with a reason the model can read', async () => {
    const { cards } = setup();
    const [tool] = buildActionTools(cards, deps);
    expect(await tool?.call(ctx, { kind: 'add-indicator', indicatorId: 'nope' })).toMatchObject({ ok: false, reason: 'VALIDATION_FAILED', detail: expect.stringContaining('Unknown indicator') as unknown });
    expect(await tool?.call(ctx, { kind: 'add-indicator', indicatorId: 'rsi', inputs: { length: 0 } })).toMatchObject({ ok: false, detail: expect.stringContaining('out of range') as unknown });
    expect(await tool?.call(ctx, { kind: 'add-indicator', indicatorId: 'rsi', inputs: { source: 'hl2' } })).toMatchObject({ ok: false, detail: expect.stringContaining('one of close, open') as unknown });
    expect(await tool?.call(ctx, { kind: 'place-order', symbol: 'NSE:INFY' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('applies once with edited fields, is idempotent, and expires after 15 minutes', async () => {
    const { cards } = setup();
    const card = await cards.propose('u1', { kind: 'add-indicator', indicatorId: 'rsi', inputs: {} });
    const applied = await cards.apply('u1', card.id, { kind: 'add-indicator', indicatorId: 'rsi', inputs: { length: 9 } });
    expect(applied).toMatchObject({ state: 'applied', action: { inputs: { length: 9 } } });
    expect(await cards.apply('u1', card.id)).toEqual(applied);
    await expect(cards.apply('u1', card.id, { kind: 'add-indicator', indicatorId: 'rsi', inputs: { length: 0 } })).rejects.toBeInstanceOf(ValidationError);
    const late = await cards.propose('u1', { kind: 'open-symbol', symbol: 'NSE:INFY' });
    now += 15 * 60_000;
    await expect(cards.apply('u1', late.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('an apply and a dismiss racing each other cannot both win', async () => {
    const { store, cards } = setup();
    const card = await cards.propose('u1', { kind: 'open-symbol', symbol: 'NSE:INFY' });
    const original = store.get.bind(store);
    let raced = false;
    store.get = async (userId, id) => { const row = await original(userId, id); if (!raced) { raced = true; await cards.dismiss('u1', card.id); } return row; };
    await expect(cards.apply('u1', card.id)).rejects.toBeInstanceOf(ConflictError);
    expect(store.rows.get(card.id)?.state).toBe('dismissed');
  });

  it("another user's card is not found", async () => {
    const { cards } = setup();
    const card = await cards.propose('u1', { kind: 'open-symbol', symbol: 'NSE:INFY' });
    await expect(cards.apply('u2', card.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('indicator tools', () => {
  const result = (n: number): IndicatorResult => ({ instrumentId: 'NSE:INFY', resolvedId: 'NSE:INFY', interval: '5', ref: 'builtin:rsi@1', inputs: { length: 14 },
    times: Array.from({ length: n }, (_, i) => i), plots: [{ id: 'rsi', values: Array.from({ length: n }, (_, i) => i) }], status: { state: 'live' } } as unknown as IndicatorResult);

  it('returns only the latest bars the model asked for, computed by the server', async () => {
    const compute = vi.fn().mockResolvedValue(result(500));
    const tool = buildIndicatorTools({ list: () => [rsi], compute }, deps).find(t => t.name === 'getIndicator');
    const out = await tool?.call(ctx, { symbol: 'NSE:INFY', interval: '5', indicatorId: 'rsi', bars: 3 });
    expect(out).toMatchObject({ ok: true, data: { times: [497, 498, 499], plots: [{ id: 'rsi', values: [497, 498, 499] }] } });
    expect(compute).toHaveBeenCalledWith(expect.objectContaining({ indicator: { kind: 'builtin', id: 'rsi', inputs: {} }, range: { limit: 500 } }));
    expect(await tool?.call(ctx, { symbol: 'NSE:INFY', interval: '5', indicatorId: 'rsi', bars: 301 })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('lists the catalog with inputs and bounds', async () => {
    const tool = buildIndicatorTools({ list: () => [rsi], compute: vi.fn() }, deps).find(t => t.name === 'listIndicators');
    expect(await tool?.call(ctx, {})).toMatchObject({ ok: true, data: [{ id: 'rsi', inputs: [{ id: 'length', default: 14, min: 1, max: 500 }, { id: 'source', options: ['close', 'open'] }] }] });
  });

  it('no tool the agent has can place, modify or cancel an order', () => {
    const names = [...buildIndicatorTools({ list: () => [], compute: vi.fn() }, deps), ...buildActionTools({ propose: vi.fn() }, deps)].map(t => t.name);
    for (const name of names) expect(name).not.toMatch(/order|cancel|place|buy|sell|trade|broker|login|token/i);
  });
});
