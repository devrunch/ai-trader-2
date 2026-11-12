import type { AgentAction, DeskDecision } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';
import type { AgentTask } from '../domain/agent-task';
import { autoTradeBlocks } from '../domain/auto-trade';
import type { AgentTrader, OrderInput } from './agent-trader';
import type { FireResult } from './agent-tasks';
import type { TradingDesk } from './trading-desk';

interface Notify { notify(n: { userId: string; kind: 'task'; title: string; body?: string | null; link?: { threadId?: string; symbol?: string } }): Promise<void> }

const orderOf = (symbol: string, d: DeskDecision): OrderInput | null =>
  d.action === 'HOLD' || d.quantity === null || d.quantity < 1 || d.stopLoss === null ? null
    : { symbol, side: d.action === 'BUY' ? 'buy' : 'sell', type: 'market', product: 'MIS', quantity: d.quantity, stopLoss: d.stopLoss, ...(d.target === null ? {} : { target: d.target }) };

/**
 * A fired watch that runs the desk (AG-5). HOLD is silent. A BUY or SELL is placed on the paper venue after the risk gate when the task has auto-trade on,
 * inside its limits; otherwise it is proposed as a card the user confirms. Either way the user is told, and an entry is journaled.
 */
export class DeskTaskRunner {
  constructor(private readonly desk: TradingDesk, private readonly trader: AgentTrader, private readonly propose: (userId: string, action: AgentAction) => Promise<unknown>,
    private readonly notifications: Notify, private readonly env: { now: () => number; id: () => string }) {}

  async fire(task: AgentTask, reason: string, signal: AbortSignal): Promise<FireResult> {
    if (!task.desk) return { error: 'This task has no desk set', outcome: 'error' };
    const { symbol, rounds } = task.desk;
    const run = await this.desk.run(task.userId, { symbol, rounds }, signal);
    const { decision } = run;
    const link = { symbol, ...(task.threadId ? { threadId: task.threadId } : {}) };
    if (run.status !== 'done') {
      await this.notifications.notify({ userId: task.userId, kind: 'task', title: `Desk: ${symbol} stopped`, body: run.error ?? decision.summary, link });
      return { error: run.error, outcome: 'error' };
    }
    const order = orderOf(symbol, decision);
    if (!order) {
      if (decision.action !== 'HOLD') await this.notifications.notify({ userId: task.userId, kind: 'task', title: `Desk: ${decision.action} ${symbol} blocked`, body: decision.vetoReasons.join('; ') || decision.summary, link });
      return { error: null, outcome: decision.action === 'HOLD' ? 'silent' : 'report' };
    }
    const headline = `Desk: ${decision.action} ${symbol} x${String(order.quantity)} (stop ${String(order.stopLoss)}${order.target ? `, target ${String(order.target)}` : ''}, confidence ${String(Math.round(decision.confidence * 100))}%)`;
    const meta = { taskId: task.id, trigger: `${task.title}: ${reason}`.slice(0, 300), skill: decision.skill, rationale: decision.summary, backtest: null, clientOrderId: `agent-desk-${this.env.id().slice(0, 8)}` };
    if (task.autoTrade?.enabled) {
      try {
        await this.trader.enter(task.userId, order, meta, async checked => autoTradeBlocks(task.autoTrade ?? { enabled: false, maxRiskPct: 0, maxTradesPerDay: 0, requireBacktest: true },
          { symbol, riskAmount: checked.riskAmount, initialCash: checked.initialCash, tradesToday: await this.trader.tradesToday(task.id), backtest: null }));
        await this.notifications.notify({ userId: task.userId, kind: 'task', title: `${headline} placed (PAPER)`, body: decision.summary.slice(0, 600), link });
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e;
        await this.notifications.notify({ userId: task.userId, kind: 'task', title: `${headline} not placed`, body: e.message.slice(0, 600), link });
      }
      return { error: null, outcome: 'report' };
    }
    await this.propose(task.userId, { kind: 'place-order', symbol, side: order.side, type: 'market', product: 'MIS', quantity: order.quantity, stopLoss: order.stopLoss ?? 0,
      ...(order.target === undefined ? {} : { target: order.target }), rationale: decision.summary.slice(0, 500), clientOrderId: null });
    await this.notifications.notify({ userId: task.userId, kind: 'task', title: `${headline}: confirm to place (PAPER)`, body: decision.summary.slice(0, 600), link });
    return { error: null, outcome: 'report' };
  }
}
