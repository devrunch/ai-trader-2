import { describe, expect, it } from 'vitest';
import { applyCard, dismissCard, failCard, viewCard, type ActionCard } from './action-card';

const t0 = Date.parse('2026-11-10T10:00:00Z');
const card = (patch: Partial<ActionCard> = {}): ActionCard => ({
  id: 'c1', userId: 'u1', action: { kind: 'add-indicator', indicatorId: 'rsi', inputs: { length: 14 } }, state: 'pending', reason: null, drawing: null,
  createdAt: t0, expiresAt: t0 + 15 * 60_000, ...patch,
});

describe('action card (FR-AG-17)', () => {
  it('applies a pending card once; applying again returns the same applied card', () => {
    const applied = applyCard(card(), t0 + 1000);
    expect(applied).toMatchObject({ ok: true, card: { state: 'applied' } });
    expect(applyCard(applied.ok ? applied.card : card(), t0 + 2000)).toMatchObject({ ok: true, card: { state: 'applied' } });
  });

  it('applies with the fields as the user edited them, but never a different kind', () => {
    expect(applyCard(card(), t0, { kind: 'add-indicator', indicatorId: 'rsi', inputs: { length: 21 } }))
      .toMatchObject({ ok: true, card: { action: { inputs: { length: 21 } } } });
    expect(applyCard(card(), t0, { kind: 'open-symbol', symbol: 'NSE:INFY' })).toMatchObject({ ok: false, reason: 'KIND_CHANGED' });
  });

  it('expires after 15 minutes; an expired card cannot be applied', () => {
    expect(viewCard(card(), t0 + 15 * 60_000).state).toBe('expired');
    expect(applyCard(card(), t0 + 15 * 60_000)).toMatchObject({ ok: false, reason: 'EXPIRED' });
  });

  it('a dismissed card stays dismissed and cannot be applied', () => {
    const dismissed = dismissCard(card(), t0);
    expect(dismissed).toMatchObject({ ok: true, card: { state: 'dismissed' } });
    expect(applyCard(dismissed.ok ? dismissed.card : card(), t0)).toMatchObject({ ok: false, reason: 'DISMISSED' });
    expect(dismissCard(card({ state: 'applied' }), t0)).toMatchObject({ ok: false, reason: 'APPLIED' });
  });

  it('records a failure reason when applying fails on the client', () => {
    const failed = failCard(card({ state: 'applied' }), 'Chart rejected the inputs');
    expect(failed).toMatchObject({ state: 'failed', reason: 'Chart rejected the inputs' });
  });
});
