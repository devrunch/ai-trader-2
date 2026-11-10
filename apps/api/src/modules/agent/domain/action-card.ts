import type { AgentAction } from '@aitrader/contracts';

export const CARD_TTL_MS = 15 * 60_000;
type CardState = 'pending' | 'applied' | 'dismissed' | 'expired' | 'failed';
export interface ActionCard { id: string; userId: string; action: AgentAction; state: CardState; reason: string | null; createdAt: number; expiresAt: number }
type CardRefusal = 'EXPIRED' | 'DISMISSED' | 'APPLIED' | 'FAILED' | 'KIND_CHANGED';
type Decision = { ok: true; card: ActionCard } | { ok: false; reason: CardRefusal };

/** The stored state, with a pending card past its deadline shown as expired. */
export function viewCard(card: ActionCard, now: number): ActionCard {
  return card.state === 'pending' && now >= card.expiresAt ? { ...card, state: 'expired' } : card;
}

/** Idempotent: applying an applied card returns it unchanged. The user may edit fields, never the kind. */
export function applyCard(stored: ActionCard, now: number, edited?: AgentAction): Decision {
  const card = viewCard(stored, now);
  if (card.state === 'applied') return { ok: true, card };
  if (card.state !== 'pending') return { ok: false, reason: refusal(card.state) };
  if (edited && edited.kind !== card.action.kind) return { ok: false, reason: 'KIND_CHANGED' };
  return { ok: true, card: { ...card, state: 'applied', action: edited ?? card.action } };
}

export function dismissCard(stored: ActionCard, now: number): Decision {
  const card = viewCard(stored, now);
  if (card.state === 'dismissed') return { ok: true, card };
  if (card.state !== 'pending') return { ok: false, reason: refusal(card.state) };
  return { ok: true, card: { ...card, state: 'dismissed' } };
}

/** The client could not carry out an applied card (for example, the chart refused the inputs). */
export function failCard(card: ActionCard, reason: string): ActionCard {
  return { ...card, state: 'failed', reason: reason.slice(0, 300) };
}

function refusal(state: Exclude<CardState, 'pending'>): CardRefusal {
  switch (state) {
    case 'expired': return 'EXPIRED';
    case 'dismissed': return 'DISMISSED';
    case 'applied': return 'APPLIED';
    case 'failed': return 'FAILED';
  }
}
