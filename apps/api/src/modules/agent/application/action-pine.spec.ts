import type { IndicatorDefinition, PineCheck } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ActionCards, type ActionCardStore } from './action-cards';
import { buildActionTools } from './action-tools';
import type { ActionCard } from '../domain/action-card';

const definition: IndicatorDefinition = {
  ref: 'pine:0123456789ab@1', id: 'pine0123456789ab', version: 1, name: 'My EMA cross', shortName: 'EMAX', overlay: true,
  inputs: [{ id: 'len', title: 'Length', type: 'int', default: 9 }], plots: [{ id: 'ema', title: 'EMA', kind: 'line', color: 'blue', lineWidth: 1 }], levels: [],
};
const SOURCE = '//@version=5\nindicator("My EMA cross", overlay=true)\nplot(ta.ema(close, input.int(9, "Length")))';
const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };

function setup(check: PineCheck = { ok: true, definition }) {
  const rows = new Map<string, ActionCard>();
  const store: ActionCardStore = { create: c => { rows.set(c.id, c); return Promise.resolve(); },
    save: (c, from) => { if (rows.get(c.id)?.state !== from) return Promise.resolve(false); rows.set(c.id, c); return Promise.resolve(true); },
    get: (userId, id) => Promise.resolve(rows.get(id)?.userId === userId ? rows.get(id) ?? null : null) };
  const checkPine = vi.fn().mockResolvedValue(check);
  const savePine = vi.fn().mockResolvedValue('11111111-1111-4111-8111-111111111111');
  const cards = new ActionCards(store, { indicators: () => [], draw: vi.fn(), checkPine, savePine }, { now: () => 1_000, id: () => '00000000-0000-4000-8000-000000000001' });
  return { cards, checkPine, savePine, rows };
}
const tool = (cards: ActionCards) => buildActionTools(cards, deps).find(t => t.name === 'proposePineScript');

describe('proposePineScript (FR-IN-25..28, FR-AG-17)', () => {
  it('validates the shared script and proposes a pending card carrying the description, without saving', async () => {
    const { cards, checkPine, savePine } = setup();
    const result = await tool(cards)?.call(ctx, { source: SOURCE });
    expect(checkPine).toHaveBeenCalledWith(SOURCE);
    expect(result).toMatchObject({ ok: true, data: { state: 'pending', action: { kind: 'add-pine', name: 'My EMA cross', source: SOURCE, scriptId: null,
      check: { ok: true, definition: { inputs: [{ id: 'len' }], plots: [{ id: 'ema' }] } } } } });
    expect(savePine).not.toHaveBeenCalled();
  });

  it('puts the error line on the card for a script that does not compile, and refuses to apply it', async () => {
    const { cards, savePine } = setup({ ok: false, error: 'Unexpected token', line: 3 });
    const result = await tool(cards)?.call(ctx, { source: 'plot(' });
    expect(result).toMatchObject({ ok: true, data: { action: { check: { ok: false, error: 'Unexpected token', line: 3 } } } });
    await expect(cards.apply('u1', '00000000-0000-4000-8000-000000000001')).rejects.toThrow('Unexpected token');
    expect(savePine).not.toHaveBeenCalled();
  });

  it('applying saves to My scripts for the caller once and records the script id', async () => {
    const { cards, savePine } = setup();
    await tool(cards)?.call(ctx, { source: SOURCE, name: 'Mine' });
    const applied = await cards.apply('u1', '00000000-0000-4000-8000-000000000001');
    expect(savePine).toHaveBeenCalledExactlyOnceWith('u1', 'Mine', SOURCE);
    expect(applied).toMatchObject({ state: 'applied', action: { kind: 'add-pine', scriptId: '11111111-1111-4111-8111-111111111111' } });
    await cards.apply('u1', '00000000-0000-4000-8000-000000000001');
    expect(savePine).toHaveBeenCalledTimes(1);
  });

  it('does not save on dismiss, and ignores a source swapped in by an edited apply', async () => {
    const dismissed = setup();
    await tool(dismissed.cards)?.call(ctx, { source: SOURCE });
    await dismissed.cards.dismiss('u1', '00000000-0000-4000-8000-000000000001');
    expect(dismissed.savePine).not.toHaveBeenCalled();

    const edited = setup();
    const card = await edited.cards.proposePine('u1', { source: SOURCE });
    if (card.action.kind !== 'add-pine') throw new Error('expected a pine card');
    await edited.cards.apply('u1', card.id, { ...card.action, source: 'evil()' });
    expect(edited.savePine).toHaveBeenCalledWith('u1', 'My EMA cross', SOURCE);
  });

  it('needs exactly one of source or url', async () => {
    const { cards } = setup();
    expect(await tool(cards)?.call(ctx, {})).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
    expect(await tool(cards)?.call(ctx, { source: SOURCE, url: 'https://gist.githubusercontent.com/a/raw/x.pine' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
});
