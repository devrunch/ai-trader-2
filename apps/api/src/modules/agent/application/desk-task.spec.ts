import { describe, expect, it, vi } from 'vitest';
import type { AgentTask } from '../domain/agent-task';
import { ValidationError } from '../../../shared/errors';
import { DeskTaskRunner } from './desk-task';
import { setupSpec } from './desk-setup-backtest';

const decision = { action: 'BUY', confidence: 0.7, entry: 100, stopLoss: 98, target: 104, quantity: 10, skill: 'gap-trading', summary: 'Breakout', vetoReasons: [] };
const task = (requireBacktest: boolean): AgentTask => ({ id: 't1', userId: 'u1', title: 'Desk', threadId: null, desk: { symbol: 'NSE:INFY', rounds: 1 },
  autoTrade: { enabled: true, maxRiskPct: 5, maxTradesPerDay: 3, requireBacktest } } as unknown as AgentTask);

function setup(note: { symbol: string; interval: string; profitFactor: number | null; tradeCount: number; summary: string } | Error) {
  const desk = { run: vi.fn().mockResolvedValue({ status: 'done', decision, error: null }) };
  const entered: unknown[] = [];
  const trader = { tradesToday: vi.fn().mockResolvedValue(0),
    enter: vi.fn().mockImplementation(async (_u: string, _o: unknown, meta: unknown, policy: (c: unknown) => Promise<{ blocks: string[] }>) => {
      const verdict = await policy({ riskAmount: 20, initialCash: 1_000_000 });
      if (verdict.blocks.length > 0) throw new ValidationError(verdict.blocks.join('; '));
      entered.push(meta);
    }) };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  const backtest = vi.fn().mockImplementation(() => (note instanceof Error ? Promise.reject(note) : Promise.resolve(note)));
  const runner = new DeskTaskRunner(desk as never, trader as never, vi.fn(), notifications, { now: () => 1, id: () => 'abcdefgh-1' }, backtest);
  return { runner, backtest, entered, trader, notifications };
}
const good = { symbol: 'NSE:INFY', interval: '15', profitFactor: 1.5, tradeCount: 40, summary: 'NSE:INFY 15, 2000 bars: 40 trades, profit factor 1.5' };

describe('desk task with requireBacktest', () => {
  it('backtests the setup before entry and journals its summary (AG-5 gap)', async () => {
    const { runner, backtest, entered } = setup(good);
    await runner.fire(task(true), 'x', new AbortController().signal);
    expect(backtest).toHaveBeenCalledWith('NSE:INFY', decision);
    expect(entered).toMatchObject([{ backtest: good.summary }]);
  });
  it('refuses the entry when the backtest has too few trades', async () => {
    const { runner, entered, notifications } = setup({ ...good, tradeCount: 5 });
    await runner.fire(task(true), 'x', new AbortController().signal);
    expect(entered).toEqual([]);
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('not placed') as unknown }));
  });
  it('refuses the entry when the backtest cannot run', async () => {
    const { runner, entered } = setup(new Error('compute down'));
    await runner.fire(task(true), 'x', new AbortController().signal);
    expect(entered).toEqual([]);
  });
  it('skips the backtest when the task does not require one', async () => {
    const { runner, backtest, entered } = setup(good);
    await runner.fire(task(false), 'x', new AbortController().signal);
    expect(backtest).not.toHaveBeenCalled();
    expect(entered).toHaveLength(1);
  });
});

describe('setupSpec', () => {
  it('turns the trader\'s stop and target into percent distances on a trend entry', () => {
    const spec = setupSpec('NSE:INFY', { ...decision, action: 'BUY', entry: 100, stopLoss: 98 } as never);
    expect(spec.strategy).toMatchObject({ side: 'long', stopLoss: { kind: 'percent', percent: 2 }, takeProfit: { kind: 'percent', percent: 4 } });
  });
  it('shorts for a SELL and omits the target when there is none', () => {
    const spec = setupSpec('NSE:INFY', { ...decision, action: 'SELL', entry: 100, stopLoss: 103, target: null } as never);
    expect(spec.strategy.side).toBe('short');
    expect(spec.strategy.takeProfit).toBeUndefined();
  });
});
