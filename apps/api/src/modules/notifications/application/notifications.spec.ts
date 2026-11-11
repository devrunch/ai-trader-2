import { describe, expect, it, vi } from 'vitest';
import { describeFill, Notifications, type NotificationStore } from './notifications';

const fill = { userId: 'u1', instrumentId: 'NSE:RELIANCE', side: 'sell' as const, quantity: 5, price: 1323, realised: -52, clientOrderId: 'agent-abc#sl' };

describe('notifications', () => {
  it('describes fills by what caused them, with realised P&L when something closed', () => {
    expect(describeFill(fill)).toEqual({ title: 'Stop hit: sold 5 NSE:RELIANCE at 1,323.00', body: 'Realised P&L −52.00 (paper)' });
    expect(describeFill({ ...fill, clientOrderId: 'web-1#tp', realised: 98 }).title).toMatch(/^Target hit/);
    expect(describeFill({ ...fill, clientOrderId: 'squareoff#x' }).title).toMatch(/^Squared off/);
    expect(describeFill({ ...fill, side: 'buy', clientOrderId: 'agent-abc-1', realised: 0 })).toEqual({ title: 'Assistant order filled: bought 5 NSE:RELIANCE at 1,323.00', body: null });
  });

  it('a failed write is logged, never thrown', async () => {
    const warn = vi.fn();
    const store: NotificationStore = { insert: vi.fn().mockRejectedValue(new Error('db down')), list: vi.fn(), unread: vi.fn(), markRead: vi.fn() };
    await expect(new Notifications(store, { id: () => 'n1', warn }).notify({ userId: 'u1', kind: 'fill', title: 'x' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('notification not saved (Error): x');
  });
});
