import type { NotificationDto } from '@aitrader/contracts';

export type NotificationKind = NotificationDto['kind'];
export interface NewNotification { userId: string; kind: NotificationKind; title: string; body?: string | null; link?: { threadId?: string; symbol?: string } | null }
export interface NotificationStore {
  insert(row: NewNotification & { id: string }): Promise<void>;
  list(userId: string, limit: number): Promise<NotificationDto[]>;
  unread(userId: string): Promise<number>;
  markRead(userId: string, ids: string[] | null): Promise<void>;
}

/**
 * In-app notifications (owner decision 2026-11-11: in-app first, no Telegram yet). Writing one never throws:
 * a failed notification must not break the fill or the task that raised it.
 */
export class Notifications {
  constructor(private readonly store: NotificationStore, private readonly env: { id: () => string; warn: (message: string) => void }) {}

  notify(n: NewNotification): Promise<void> {
    return this.store.insert({ ...n, title: n.title.slice(0, 200), body: n.body?.slice(0, 2000) ?? null, id: this.env.id() })
      .catch((error: unknown) => { this.env.warn(`notification not saved (${error instanceof Error ? error.name : 'unknown'}): ${n.title}`); });
  }

  async list(userId: string, limit = 50): Promise<{ items: NotificationDto[]; unread: number }> {
    const [items, unread] = await Promise.all([this.store.list(userId, limit), this.store.unread(userId)]);
    return { items, unread };
  }

  markRead(userId: string, ids?: string[]): Promise<void> { return this.store.markRead(userId, ids ?? null); }
}

const price = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export interface FillEvent { userId: string; instrumentId: string; side: 'buy' | 'sell'; quantity: number; price: number; realised: number; clientOrderId: string }

/** One line a trader reads at a glance: what filled and why, and the realised P&L when it closed something. */
export function describeFill(e: FillEvent): { title: string; body: string | null } {
  const why = e.clientOrderId.endsWith('#sl') ? 'Stop hit' : e.clientOrderId.endsWith('#tp') ? 'Target hit'
    : e.clientOrderId.startsWith('squareoff#') ? 'Squared off' : e.clientOrderId.startsWith('agent-') ? 'Assistant order filled' : 'Order filled';
  const title = `${why}: ${e.side === 'buy' ? 'bought' : 'sold'} ${String(e.quantity)} ${e.instrumentId} at ${price.format(e.price)}`;
  const body = e.realised === 0 ? null : `Realised P&L ${e.realised > 0 ? '+' : '−'}${price.format(Math.abs(e.realised))} (paper)`;
  return { title, body };
}
