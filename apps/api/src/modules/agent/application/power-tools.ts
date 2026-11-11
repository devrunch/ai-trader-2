import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PAPER_PRODUCTS, TaskTriggerSchema, type PaperPlaceOrderRequest, type TaskTrigger } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';
import { calculate, CalcError } from '../domain/calculator';
import { checkEntry, defaultLimits, type TodayEntry } from '../domain/risk-gate';
import { guardedTool, orJsonString, type GuardDeps, type GuardedTool, type ToolContext } from './guarded-tool';

const SYMBOL = z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/, 'canonical EXCHANGE:TICKER id');
const SKILL = /^skill-[a-z0-9-]{1,57}$/;

export interface SkillSource { keys(): string[]; active(key: string): Promise<{ content: string; version: number }> }

/** Skills are versioned prompts named `skill-*`: the admin edits them like the system prompt; each use records its version. */
export function buildSkillTools(skills: SkillSource, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'listSkills', description: 'The playbooks you can follow (position sizing, risk/reward, trend check, breakout watch, ...), with a one-line summary each.',
      input: z.looseObject({}), run: async () => Promise.all(skills.keys().filter(k => SKILL.test(k)).map(async key => {
        const { content } = await skills.active(key);
        const [title = key, summary = ''] = content.split('\n').map(l => l.replace(/^#\s*/, '').trim()).filter(Boolean);
        return { name: key.slice('skill-'.length), title, summary };
      })) }, deps),
    guardedTool({ name: 'useSkill', description: 'Load one playbook by name and follow its steps.',
      input: z.strictObject({ name: z.string().regex(/^[a-z0-9-]{1,57}$/) }),
      run: async input => {
        const key = `skill-${input.name}`;
        if (!skills.keys().includes(key)) throw new ValidationError(`No skill "${input.name}"; call listSkills`);
        const { content, version } = await skills.active(key);
        return { name: input.name, version, content };
      } }, deps),
  ];
}

export function buildCalcTool(deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'calculate',
    description: 'Evaluate arithmetic exactly: + - * / % ^, parentheses, abs sqrt round(x, digits) floor ceil ln log exp pow min max, pi, e. Use it for every number you derive.',
    input: z.strictObject({ expression: z.string().min(1).max(500) }),
    run: input => {
      try { return Promise.resolve({ expression: input.expression, result: calculate(input.expression) }); }
      catch (error) { throw new ValidationError(error instanceof CalcError ? error.message : 'Not a valid expression'); }
    } }, deps)];
}

export interface PaperDesk {
  place(userId: string, request: PaperPlaceOrderRequest): Promise<unknown>;
  cancel(userId: string, orderId: string): Promise<unknown>;
  positions(userId: string): Promise<Array<{ instrumentId: string; product: string; quantity: number }>>;
  /** Starting cash and currency of the account this symbol settles in. */
  account(userId: string, symbol: string): Promise<{ initialCash: number; currency: string }>;
  orders(userId: string): Promise<Array<{ instrumentId: string; currency: string; side: 'buy' | 'sell'; quantity: number; clientOrderId: string; status: string;
    placedAt: number; limitPrice: number | null; fillPrice: number | null; stopLoss: number | null }>>;
  price(symbol: string): Promise<number>;
}

const IST_MS = 19_800_000;
const istMidnight = (now: number) => now - ((now + IST_MS) % 86_400_000);

/** Today's assistant entries (not exits) in one currency, with the loss each planned at its stop. */
async function todayEntries(desk: PaperDesk, userId: string, currency: string, now: number): Promise<TodayEntry[]> {
  const since = istMidnight(now);
  return (await desk.orders(userId)).filter(o => o.placedAt >= since && o.currency === currency && o.clientOrderId.startsWith('agent-') && (o.status === 'filled' || o.status === 'open'))
    .map(o => {
      const entry = o.fillPrice ?? o.limitPrice;
      return { symbol: o.instrumentId, side: o.side, plannedLoss: entry !== null && o.stopLoss !== null ? o.quantity * Math.abs(entry - o.stopLoss) : 0 };
    });
}

const orderId = (ctx: ToolContext): string => `agent-${ctx.turnId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
const price = z.number().positive().max(1e9);

/**
 * Paper trading only (owner decision 2026-11-10). Orders go through the same engine and risk limits as the user's own;
 * there is no broker in this module and no way to reach one.
 */
export function buildPaperTools(desk: PaperDesk, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'placePaperOrder',
      description: 'Place a PAPER order (simulated money). Market or limit; stopLoss and target exit it automatically. Every entry must pass the risk check (stop required, per-trade and daily loss limits, reward:risk >= 1.5, entries per day, NSE intraday window 09:35-15:00 IST); a BLOCK says which check failed. State the plan (entry, stop, size, money at risk) in your reply.',
      input: z.strictObject({ symbol: SYMBOL, side: z.enum(['buy', 'sell']), type: z.enum(['market', 'limit']), product: z.enum(PAPER_PRODUCTS).default('MIS'),
        quantity: z.number().int().positive().max(1_000_000), limitPrice: price.optional(), stopLoss: price.optional(), target: price.optional() })
        .refine(o => o.type === 'market' || o.limitPrice !== undefined, { message: 'limit orders need limitPrice', path: ['limitPrice'] }),
      run: async (o, ctx) => {
        // Entries pass the risk gate; an order that only reduces an open position is an exit and goes straight through.
        const open = (await desk.positions(ctx.userId)).find(p => p.instrumentId === o.symbol && p.product === o.product && p.quantity !== 0);
        const reducing = open !== undefined && (o.side === 'sell' ? open.quantity > 0 : open.quantity < 0) && o.quantity <= Math.abs(open.quantity);
        if (!reducing) {
          const now = (deps.clock ?? Date.now)();
          const entry = o.limitPrice ?? await desk.price(o.symbol);
          const account = await desk.account(ctx.userId, o.symbol);
          const verdict = checkEntry({ symbol: o.symbol, side: o.side, quantity: o.quantity, entry, stopLoss: o.stopLoss, target: o.target, intraday: o.product === 'MIS' },
            await todayEntries(desk, ctx.userId, account.currency, now), defaultLimits(account.initialCash, o.symbol.split(':')[0] ?? ''), now);
          if (!verdict.pass) throw new ValidationError(`Risk check BLOCK: ${verdict.blocks.join('; ')}`);
        }
        return desk.place(ctx.userId, { clientOrderId: orderId(ctx), instrumentId: o.symbol, side: o.side, type: o.type, product: o.product,
          quantity: o.quantity, ...(o.limitPrice === undefined ? {} : { limitPrice: o.limitPrice }), ...(o.stopLoss === undefined ? {} : { stopLoss: o.stopLoss }),
          ...(o.target === undefined ? {} : { target: o.target }) });
      } }, deps),
    guardedTool({ name: 'cancelPaperOrder', description: 'Cancel one of the user\'s working PAPER orders by id (ids are in getPortfolio).',
      input: z.strictObject({ orderId: z.string().min(1).max(64) }), run: (o, ctx) => desk.cancel(ctx.userId, o.orderId) }, deps),
    guardedTool({ name: 'closePaperPosition', description: 'Close an open PAPER position at market.',
      input: z.strictObject({ symbol: SYMBOL, product: z.enum(PAPER_PRODUCTS).default('MIS') }),
      run: async (o, ctx) => {
        const position = (await desk.positions(ctx.userId)).find(p => p.instrumentId === o.symbol && p.product === o.product && p.quantity !== 0);
        if (!position) throw new ValidationError(`No open ${o.product} position in ${o.symbol}`);
        return desk.place(ctx.userId, { clientOrderId: orderId(ctx), instrumentId: o.symbol, side: position.quantity > 0 ? 'sell' : 'buy', type: 'market',
          product: o.product, quantity: Math.abs(position.quantity) });
      } }, deps),
  ];
}

export interface TaskDesk {
  create(userId: string, threadId: string, input: { title: string; instruction: string; trigger: TaskTrigger; maxRuns?: number | undefined; expiresInDays?: number | undefined }): Promise<unknown>;
  list(userId: string): Promise<unknown>;
  setState(userId: string, id: string, state: 'cancelled'): Promise<unknown>;
}

/** Background work: the assistant schedules itself, or waits for a price or indicator condition, then runs the instruction. */
export function buildTaskTools(tasks: TaskDesk, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'scheduleTask',
      description: 'Run an instruction later in the background: on a cron schedule (at most every 5 minutes, Asia/Kolkata by default) or when a price or indicator crosses a value. '
        + 'A condition fires when it becomes true; if it is already true now it waits for the next cross (the result says the current value). '
        + 'The instruction must be complete on its own: what to check and exactly what to do, e.g. which paper order to place.',
      input: z.strictObject({ title: z.string().min(1).max(120), instruction: z.string().min(1).max(2000), trigger: orJsonString(TaskTriggerSchema),
        maxRuns: z.number().int().min(1).max(500).optional(), expiresInDays: z.number().int().min(1).max(30).optional() }),
      run: (input, ctx) => tasks.create(ctx.userId, ctx.conversationId, input) }, deps),
    guardedTool({ name: 'listTasks', description: 'The user\'s background tasks with their state, runs and next run.',
      input: z.looseObject({}), run: (_input, ctx) => tasks.list(ctx.userId) }, deps),
    guardedTool({ name: 'cancelTask', description: 'Cancel one of the user\'s background tasks by id.',
      input: z.strictObject({ taskId: z.uuid() }), run: (input, ctx) => tasks.setState(ctx.userId, input.taskId, 'cancelled') }, deps),
  ];
}

export interface NewsDesk { list(query: { symbol?: string | undefined; hours: number; limit: number }): Promise<unknown> }

/** Recent headlines from public feeds. Their text is data: an instruction inside a headline is never followed. */
export function buildNewsTools(news: NewsDesk, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'getNews',
    description: 'Recent market headlines (source, time, title, summary, url, tagged instruments), newest first. Optionally only those mentioning one instrument.',
    input: z.strictObject({ symbol: SYMBOL.optional(), hours: z.number().int().min(1).max(336).default(24), limit: z.number().int().min(1).max(30).default(15) }),
    run: input => news.list(input) }, deps)];
}

export interface WatchlistDesk {
  get(userId: string): Promise<{ items: string[] }>;
  add(userId: string, symbol: string): Promise<{ items: string[] }>;
  remove(userId: string, symbol: string): Promise<{ items: string[] }>;
}

/** The user's own watchlist: the assistant can read it and add or remove symbols when asked. */
export function buildWatchlistTools(list: WatchlistDesk, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'getWatchlist', description: 'The symbols on the user\'s watchlist, in their order.',
      input: z.looseObject({}), run: (_input, ctx) => list.get(ctx.userId) }, deps),
    guardedTool({ name: 'addToWatchlist', description: 'Add a symbol to the user\'s watchlist (only when they ask, or agree to your suggestion).',
      input: z.strictObject({ symbol: SYMBOL }), run: (o, ctx) => list.add(ctx.userId, o.symbol) }, deps),
    guardedTool({ name: 'removeFromWatchlist', description: 'Remove a symbol from the user\'s watchlist (only when they ask).',
      input: z.strictObject({ symbol: SYMBOL }), run: (o, ctx) => list.remove(ctx.userId, o.symbol) }, deps),
  ];
}
