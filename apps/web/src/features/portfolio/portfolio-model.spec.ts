import { expect, it } from 'vitest';
import type { PaperFill, PaperOrder, PaperPosition } from '@aitrader/contracts';
import { ownerOf, positionOwner, splitResults } from './portfolio-model';

const order = (id: string, clientOrderId: string, instrumentId = 'NSE:RELIANCE', over: Partial<PaperOrder> = {}): PaperOrder => ({
  id, clientOrderId, instrumentId, currency: 'INR', side: 'buy', type: 'market', product: 'MIS', quantity: 10, limitPrice: null, triggerPrice: null, stopLoss: null, target: null,
  status: 'filled', triggered: false, rejectReason: null, closeReason: null, parentOrderId: null, fillPrice: 100, placedAt: 1, expiresAt: 2, filledAt: 1, updatedAt: 1, ...over });
const fill = (orderId: string, realisedPnl: number, instrumentId = 'NSE:RELIANCE'): PaperFill => ({
  id: `f-${orderId}`, orderId, instrumentId, currency: 'INR', side: 'sell', product: 'MIS', quantity: 10, price: 100, slippage: 0, charges: {} as PaperFill['charges'], realisedPnl, filledAt: 2 });

it('tells the assistant\'s orders from the user\'s, and leaves square-offs to the position\'s owner', () => {
  expect(ownerOf('agent-1')).toBe('ai');
  expect(ownerOf('agent-desk-abc')).toBe('ai');
  expect(ownerOf('web-123')).toBe('you');
  expect(ownerOf('squareoff#9')).toBeNull();
});

it('splits realised results and win rate by who traded', () => {
  const orders = [order('o1', 'agent-1'), order('o2', 'agent-1x', 'NSE:RELIANCE', { side: 'sell', parentOrderId: 'o1' }), order('o3', 'web-1', 'NSE:TCS'), order('o4', 'web-2', 'NSE:TCS', { side: 'sell' }),
    order('o5', 'squareoff#1', 'NSE:RELIANCE', { side: 'sell' })];
  const result = splitResults(orders, [fill('o2', 500), fill('o4', -200, 'NSE:TCS'), fill('o5', -100)]);
  expect(result.ai).toEqual({ realised: 400, closedTrades: 2, wins: 1, orders: 1 });
  expect(result.you).toEqual({ realised: -200, closedTrades: 1, wins: 0, orders: 2 });
});

it('names who holds an open position', () => {
  const position = { instrumentId: 'NSE:RELIANCE' } as PaperPosition;
  expect(positionOwner(position, [order('o1', 'agent-1')])).toBe('ai');
  expect(positionOwner(position, [order('o1', 'web-1')])).toBe('you');
  expect(positionOwner(position, [order('o1', 'agent-1'), order('o2', 'web-1')])).toBe('both');
});
