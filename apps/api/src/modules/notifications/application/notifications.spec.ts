import { describe, expect, it, vi } from 'vitest';
import { describeFill, Notifications } from './notifications';

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
    const store = { insert: vi.fn().mockRejectedValue(new Error('db down')), list: vi.fn(), unread: vi.fn(), markRead: vi.fn() };
    await expect(new Notifications(store, { id: () => 'n1', warn }).notify({ userId: 'u1', kind: 'fill', title: 'x' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('notification not saved (Error): x');
  });

  it('emails a REPORT only when flagged, and a failing mail never breaks the notification', async () => {
    const store = { insert: vi.fn().mockResolvedValue(undefined), list: vi.fn(), unread: vi.fn(), markRead: vi.fn() };
    const deliver = vi.fn().mockResolvedValue('sent');
    const notifications = new Notifications(store, { id: () => 'n1', warn: vi.fn() }, { deliver });
    await notifications.notify({ userId: 'u1', kind: 'task', title: 'plain' });
    expect(deliver).not.toHaveBeenCalled();
    await notifications.notify({ userId: 'u1', kind: 'task', title: 'Watch: INR', body: 'Rupee fell', email: true });
    expect(deliver).toHaveBeenCalledWith('u1', 'Watch: INR', 'Rupee fell');
    expect(store.insert).toHaveBeenCalledTimes(2);
    const warn = vi.fn();
    await expect(new Notifications(store, { id: () => 'n2', warn }, { deliver: () => Promise.reject(new Error('smtp')) }).notify({ userId: 'u1', kind: 'task', title: 'x', email: true })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('report email failed (Error): x');
  });
});
