import { describe, expect, it, vi } from 'vitest';
import { TradeLog, type TradeRow } from './agent-trader';

const row = (patch: Partial<TradeRow> = {}): Omit<TradeRow, 'userId'> => ({ id: 'j1', createdAt: '2026-11-12T04:00:00.000Z', venue: 'paper', taskId: null, trigger: 'chat request', skill: null,
  rationale: 'why', symbol: 'NSE:INFY', side: 'buy', quantity: 10, entry: 1500, stopLoss: 1480, target: 1560, riskAmount: 200, currency: 'INR', backtest: null, clientOrderId: 'agent-a', ...patch });
const order = (id: string, clientOrderId: string, status: string) => ({ id, instrumentId: 'NSE:INFY', currency: 'INR', side: 'buy' as const, quantity: 10, clientOrderId, status, placedAt: 0,
  limitPrice: null, fillPrice: 1500, stopLoss: 1480 });

describe('TradeLog', () => {
  it('adds the entry order status and the profit so far: realised exits plus the open position', async () => {
    const desk = { orders: vi.fn().mockResolvedValue([order('o1', 'agent-a', 'filled'), order('o2', 'agent-a#tp', 'filled'), order('o3', 'agent-b', 'filled')]),
      fills: vi.fn().mockResolvedValue([{ orderId: 'o2', realisedPnl: 600 }, { orderId: 'o3', realisedPnl: -50 }]), positions: vi.fn().mockResolvedValue([]) };
    const [trade] = await new TradeLog({ list: () => Promise.resolve([row()]), add: vi.fn(), countSince: vi.fn() }, desk as never).list('u1', 10);
    expect(trade).toMatchObject({ status: 'filled', pnl: 600, clientOrderId: 'agent-a' });
  });

  it('shows no profit for an order that has not filled and nothing at all for an empty journal', async () => {
    const desk = { orders: vi.fn().mockResolvedValue([order('o1', 'agent-a', 'open')]), fills: vi.fn().mockResolvedValue([]), positions: vi.fn().mockResolvedValue([]) };
    const journal = { list: vi.fn().mockResolvedValue([row()]), add: vi.fn(), countSince: vi.fn() };
    expect((await new TradeLog(journal, desk as never).list('u1', 10))[0]).toMatchObject({ status: 'open', pnl: null });
    journal.list.mockResolvedValue([]);
    expect(await new TradeLog(journal, desk as never).list('u1', 10)).toEqual([]);
    expect(desk.orders).toHaveBeenCalledTimes(1);
  });
});
