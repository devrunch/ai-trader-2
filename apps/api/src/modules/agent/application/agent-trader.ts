import type { AgentTradeDto, PaperPlaceOrderRequest } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';
import type { AgentTask } from '../domain/agent-task';
import type { BacktestNote } from '../domain/auto-trade';
import { checkEntry, defaultLimits, type TodayEntry } from '../domain/risk-gate';
import type { ExecutionVenue } from './execution-venue';

export type TradingDesk = Omit<ExecutionVenue, 'kind'>;
export interface TradeRow extends Omit<AgentTradeDto, 'status' | 'pnl'> { userId: string }
export interface TradeJournal {
  /** Idempotent on (user, client order id). */
  add(row: TradeRow): Promise<void>;
  countSince(taskId: string, since: number): Promise<number>;
  list(userId: string, limit: number): Promise<Array<Omit<TradeRow, 'userId'>>>;
}
export interface OrderInput {
  symbol: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; product: PaperPlaceOrderRequest['product'];
  quantity: number; limitPrice?: number | undefined; stopLoss?: number | undefined; target?: number | undefined;
}
export interface EntryPolicy { blocks: string[]; backtestSkip: string | null }
export interface TradeMeta { taskId: string | null; trigger: string; skill: string | null; rationale: string; backtest: string | null; clientOrderId: string }
export interface CheckedEntry { entry: number; riskAmount: number | null; initialCash: number; currency: string }

const IST_MS = 19_800_000;
const istMidnight = (now: number): number => now - ((now + IST_MS) % 86_400_000);

/** Today's assistant entries (not exits) in one currency, with the loss each planned at its stop. */
async function todayEntries(desk: TradingDesk, userId: string, currency: string, now: number): Promise<TodayEntry[]> {
  const since = istMidnight(now);
  return (await desk.orders(userId)).filter(o => o.placedAt >= since && o.currency === currency && o.clientOrderId.startsWith('agent-') && (o.status === 'filled' || o.status === 'open'))
    .map(o => {
      const entry = o.fillPrice ?? o.limitPrice;
      return { symbol: o.instrumentId, side: o.side, plannedLoss: entry !== null && o.stopLoss !== null ? o.quantity * Math.abs(entry - o.stopLoss) : 0 };
    });
}

const request = (o: OrderInput, clientOrderId: string): PaperPlaceOrderRequest => ({ clientOrderId, instrumentId: o.symbol, side: o.side, type: o.type, product: o.product,
  quantity: o.quantity, ...(o.limitPrice === undefined ? {} : { limitPrice: o.limitPrice }), ...(o.stopLoss === undefined ? {} : { stopLoss: o.stopLoss }),
  ...(o.target === undefined ? {} : { target: o.target }) });

/** Every order the assistant sends: entries pass the risk gate and are written to the trade journal; exits go straight through. */
export class AgentTrader {
  constructor(private readonly desk: TradingDesk, private readonly journal: TradeJournal, private readonly env: { now: () => number; id: () => string }) {}

  /** The paper account an order on this symbol would use (its capital and currency). */
  account(userId: string, symbol: string): Promise<{ initialCash: number; currency: string }> { return this.desk.account(userId, symbol); }

  /** An order that only reduces an open position is an exit. */
  async isReducing(userId: string, o: OrderInput): Promise<boolean> {
    const open = (await this.desk.positions(userId)).find(p => p.instrumentId === o.symbol && p.product === o.product && p.quantity !== 0);
    return open !== undefined && (o.side === 'sell' ? open.quantity > 0 : open.quantity < 0) && o.quantity <= Math.abs(open.quantity);
  }

  exit(userId: string, o: OrderInput, clientOrderId: string): Promise<unknown> { return this.desk.place(userId, request(o, clientOrderId)); }

  /** The risk gate; throws the reasons when an entry is blocked. */
  async checkEntry(userId: string, o: OrderInput): Promise<CheckedEntry> {
    const now = this.env.now();
    const entry = o.limitPrice ?? await this.desk.price(o.symbol);
    const account = await this.desk.account(userId, o.symbol);
    const verdict = checkEntry({ symbol: o.symbol, side: o.side, quantity: o.quantity, entry, stopLoss: o.stopLoss, target: o.target, intraday: o.product === 'MIS' },
      await todayEntries(this.desk, userId, account.currency, now), defaultLimits(account.initialCash, o.symbol.split(':')[0] ?? ''), now);
    if (!verdict.pass) throw new ValidationError(`Risk check BLOCK: ${verdict.blocks.join('; ')}`);
    return { entry, riskAmount: o.stopLoss === undefined ? null : o.quantity * Math.abs(entry - o.stopLoss), initialCash: account.initialCash, currency: account.currency };
  }

  cancel(userId: string, orderId: string): Promise<unknown> { return this.desk.cancel(userId, orderId); }

  positions(userId: string): ReturnType<TradingDesk['positions']> { return this.desk.positions(userId); }

  tradesToday(taskId: string): Promise<number> { return this.journal.countSince(taskId, istMidnight(this.env.now())); }

  /** Entry: risk gate, then `extraBlocks` (e.g. a task's auto-trade limits), then the venue, then the journal row. */
  async enter(userId: string, o: OrderInput, meta: TradeMeta, policy?: (checked: CheckedEntry) => Promise<EntryPolicy>): Promise<unknown> {
    const checked = await this.checkEntry(userId, o);
    const verdict = await policy?.(checked) ?? { blocks: [], backtestSkip: null };
    if (verdict.blocks.length > 0) {
      // A setup that was backtested and failed is a decision worth keeping: it goes in the journal as a trade not taken.
      if (verdict.backtestSkip) await this.record(userId, o, meta, checked, verdict.backtestSkip);
      throw new ValidationError(`Auto-trade BLOCK: ${verdict.blocks.join('; ')}`);
    }
    const placed = await this.desk.place(userId, request(o, meta.clientOrderId));
    await this.record(userId, o, meta, checked, null);
    return placed;
  }

  private record(userId: string, o: OrderInput, meta: TradeMeta, checked: CheckedEntry, skipped: string | null): Promise<void> {
    return this.journal.add({ id: this.env.id(), userId, createdAt: new Date(this.env.now()).toISOString(), venue: 'paper', taskId: meta.taskId, trigger: meta.trigger.slice(0, 300),
      skill: meta.skill, rationale: meta.rationale.slice(0, 500), symbol: o.symbol, side: o.side, quantity: o.quantity, entry: checked.entry, stopLoss: o.stopLoss ?? null,
      target: o.target ?? null, riskAmount: checked.riskAmount, currency: checked.currency, backtest: meta.backtest, clientOrderId: meta.clientOrderId, skipped });
  }
}

export interface BackgroundRun { task: AgentTask; reason: string; backtest: BacktestNote | null }

/** The task whose wake-up is running in a conversation, so the order tool can tell a background entry from a chat request. */
export class BackgroundRuns {
  private readonly runs = new Map<string, BackgroundRun>();

  async during<T>(conversationId: string, run: BackgroundRun, work: () => Promise<T>): Promise<T> {
    this.runs.set(conversationId, run);
    try { return await work(); } finally { this.runs.delete(conversationId); }
  }

  get(conversationId: string): BackgroundRun | undefined { return this.runs.get(conversationId); }

  noteBacktest(conversationId: string, note: BacktestNote): void {
    const run = this.runs.get(conversationId);
    if (run) this.runs.set(conversationId, { ...run, backtest: note });
  }
}

/** The journal with how each trade is going: the entry order's status and the profit or loss so far. */
export class TradeLog {
  constructor(private readonly journal: TradeJournal, private readonly desk: TradingDesk) {}

  async list(userId: string, limit: number): Promise<AgentTradeDto[]> {
    const rows = await this.journal.list(userId, limit);
    if (rows.length === 0) return [];
    const [orders, fills, positions] = await Promise.all([this.desk.orders(userId), this.desk.fills(userId), this.desk.positions(userId)]);
    return rows.map(trade => {
      const family = orders.filter(o => o.clientOrderId === trade.clientOrderId || o.clientOrderId.startsWith(`${trade.clientOrderId}#`));
      const entry = family.find(o => o.clientOrderId === trade.clientOrderId);
      const ids = new Set(family.map(o => o.id));
      const realised = fills.filter(f => ids.has(f.orderId)).reduce((sum, f) => sum + f.realisedPnl, 0);
      const open = positions.find(p => p.instrumentId === trade.symbol && p.quantity !== 0)?.unrealisedPnl ?? 0;
      const pnl = entry?.status === 'filled' || realised !== 0 ? Math.round((realised + open) * 100) / 100 : null;
      return { ...trade, status: trade.skipped ? 'skipped' : entry?.status ?? null, pnl: trade.skipped ? null : pnl };
    });
  }
}
