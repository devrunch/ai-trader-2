import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AlertCreateSchema, type AgentAction, type DeskTask, CalendarQuerySchema, PAPER_PRODUCTS, TaskTriggerSchema, WATCH_MARKETS, type AlertCreate, type CalendarQuery, type TaskTrigger } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';
import { autoTradeBlocks } from '../domain/auto-trade';
import { calculate, CalcError } from '../domain/calculator';
import { describeWatch } from '../domain/watch';
import type { AgentTrader, BackgroundRuns } from './agent-trader';
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

const orderId = (ctx: ToolContext): string => `agent-${ctx.turnId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
const price = z.number().positive().max(1e9);

/** What a background wake-up needs to place or propose orders. */
export interface TradeContext { runs: BackgroundRuns; propose(userId: string, action: AgentAction): Promise<unknown> }

/**
 * Paper trading only by default (owner decision 2026-11-10; a real broker is a development-only stub, see execution-venue.ts). Orders go through the same engine
 * and risk limits as the user's own. In a chat the user is present and an entry goes through the risk gate; in a background wake-up an entry is placed only by a
 * task with auto-trade switched on, inside its limits, and otherwise becomes an action card the user confirms.
 */
export function buildPaperTools(trader: AgentTrader, deps: GuardDeps, background?: TradeContext): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'placePaperOrder',
      description: 'Place a PAPER order (simulated money). Say why in rationale (and the skill you followed). In a background wake-up an entry is placed only if the task has auto-trade on, within its limits; otherwise it becomes a card the user confirms. Market or limit; stopLoss and target exit it automatically. Every entry must pass the risk check (stop required, per-trade and daily loss limits, reward:risk >= 1.5, entries per day, NSE intraday window 09:35-15:00 IST); a BLOCK says which check failed. State the plan (entry, stop, size, money at risk) in your reply.',
      input: z.strictObject({ symbol: SYMBOL, side: z.enum(['buy', 'sell']), type: z.enum(['market', 'limit']), product: z.enum(PAPER_PRODUCTS).default('MIS'),
        quantity: z.number().int().positive().max(1_000_000), limitPrice: price.optional(), stopLoss: price.optional(), target: price.optional(),
        rationale: z.string().max(500).optional(), skill: z.string().regex(/^[a-z0-9-]{1,57}$/).optional() })
        .refine(o => o.type === 'market' || o.limitPrice !== undefined, { message: 'limit orders need limitPrice', path: ['limitPrice'] }),
      run: async (o, ctx) => {
        const clientOrderId = orderId(ctx);
        if (await trader.isReducing(ctx.userId, o)) return trader.exit(ctx.userId, o, clientOrderId);
        const run = background?.runs.get(ctx.conversationId);
        const meta = { taskId: run?.task.id ?? null, trigger: run ? `${run.task.title}: ${run.reason}` : 'chat request', skill: o.skill ?? null, rationale: o.rationale ?? '',
          backtest: run?.backtest?.summary ?? null, clientOrderId };
        if (run && !run.task.autoTrade?.enabled) {
          await trader.checkEntry(ctx.userId, o);
          if (o.stopLoss === undefined || !background) throw new ValidationError('A proposed order needs a stop loss');
          return background.propose(ctx.userId, { kind: 'place-order', symbol: o.symbol, side: o.side, type: o.type, product: o.product, quantity: o.quantity,
            ...(o.limitPrice === undefined ? {} : { limitPrice: o.limitPrice }), stopLoss: o.stopLoss, ...(o.target === undefined ? {} : { target: o.target }),
            rationale: (o.rationale ?? '').slice(0, 500), clientOrderId: null });
        }
        const limits = run?.task.autoTrade;
        return trader.enter(ctx.userId, o, meta, limits?.enabled && run
          ? async checked => autoTradeBlocks(limits, { symbol: o.symbol, riskAmount: checked.riskAmount, initialCash: checked.initialCash, tradesToday: await trader.tradesToday(run.task.id), backtest: run.backtest })
          : undefined);
      } }, deps),
    guardedTool({ name: 'cancelPaperOrder', description: 'Cancel one of the user\'s working PAPER orders by id (ids are in getPortfolio).',
      input: z.strictObject({ orderId: z.string().min(1).max(64) }), run: (o, ctx) => trader.cancel(ctx.userId, o.orderId) }, deps),
    guardedTool({ name: 'closePaperPosition', description: 'Close an open PAPER position at market.',
      input: z.strictObject({ symbol: SYMBOL, product: z.enum(PAPER_PRODUCTS).default('MIS') }),
      run: async (o, ctx) => {
        const position = (await trader.positions(ctx.userId)).find(p => p.instrumentId === o.symbol && p.product === o.product && p.quantity !== 0);
        if (!position) throw new ValidationError(`No open ${o.product} position in ${o.symbol}`);
        return trader.exit(ctx.userId, { symbol: o.symbol, side: position.quantity > 0 ? 'sell' : 'buy', type: 'market', product: o.product, quantity: Math.abs(position.quantity) }, orderId(ctx));
      } }, deps),
  ];
}

/** Run the trading desk on a match instead of a single assistant turn (the symbol defaults to the watch's first symbol). */
const DeskOption = z.strictObject({ symbol: SYMBOL.optional(), rounds: z.number().int().min(1).max(2).default(1) }).optional();
function deskFor(option: z.infer<typeof DeskOption>, fallback: string | undefined): DeskTask | null {
  if (!option) return null;
  const symbol = option.symbol ?? fallback;
  if (!symbol) throw new ValidationError('runDesk needs a symbol: pass desk.symbol');
  return { symbol, rounds: option.rounds };
}

export interface TaskDesk {
  create(userId: string, threadId: string, input: { title: string; instruction: string; trigger: TaskTrigger; maxRuns?: number | undefined; expiresInDays?: number | undefined; desk?: DeskTask | null | undefined }): Promise<unknown>;
  createAlert(userId: string, input: AlertCreate): Promise<unknown>;
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
    guardedTool({ name: 'createAlert',
      description: 'Set a plain alert for the user: a notification when a price or indicator condition crosses, with no assistant run. '
        + 'Prefer this over scheduleTask when the user only wants to be told ("alert me when NIFTY goes above 24,500"). repeat: every crossing for 30 days.',
      input: z.strictObject({ trigger: orJsonString(AlertCreateSchema.shape.trigger), repeat: z.boolean().default(false), note: z.string().max(200).optional() }),
      run: (input, ctx) => tasks.createAlert(ctx.userId, input) }, deps),
    guardedTool({ name: 'watchNews',
      description: 'Watch the news in the background and wake yourself when a matching headline arrives, then decide whether it is worth telling the user. '
        + 'Use for "watch INR news with high impact" or "tell me when something moves crude". markets: forex, india, us, commodities or all; optional symbols and keywords; minImpact high, medium or low. '
        + 'The instruction says what to look for and when to report; you will reply REPORT: or SILENT: on each wake-up. Set desk to run the multi-analyst trading desk (analysts, bull/bear debate, trader, risk manager) on a match instead; with auto-trade on the task, its BUY or SELL is placed on the paper account after the risk gate.',
      input: z.strictObject({ markets: z.array(z.enum(WATCH_MARKETS)).min(1).max(5).default(['all']), symbols: z.array(SYMBOL).max(10).default([]),
        keywords: z.array(z.string().trim().min(2).max(40)).max(10).default([]), minImpact: z.enum(['high', 'medium', 'low']).default('medium'),
        instruction: z.string().min(1).max(2000).default('Assess the headline: does it change anything for the user\'s watchlist, positions or open ideas?'),
        maxRuns: z.number().int().min(1).max(100).default(10), expiresInDays: z.number().int().min(1).max(30).default(7), desk: DeskOption }),
      run: ({ instruction, maxRuns, expiresInDays, desk, ...rest }, ctx) => {
        const trigger = { kind: 'news' as const, ...rest };
        return tasks.create(ctx.userId, ctx.conversationId, { title: describeWatch(trigger), instruction, trigger, maxRuns, expiresInDays, desk: deskFor(desk, rest.symbols[0]) });
      } }, deps),
    guardedTool({ name: 'watchEvent',
      description: 'Watch the economic calendar and wake yourself shortly after a release ("tell me when RBI policy comes out", "watch US CPI"), then decide whether it is worth telling the user. '
        + 'countries are 3-letter codes (USD, INR, EUR); title is a word in the event name; afterMinutes (default 5) lets the market react first. The wake-up includes forecast, previous and how the instruments moved. Set desk {symbol} to run the multi-analyst trading desk on the release instead of a single turn.',
      input: z.strictObject({ countries: z.array(z.string().regex(/^[A-Z]{3}$/)).max(5).default([]), title: z.string().trim().min(2).max(80).optional(),
        minImpact: z.enum(['High', 'Medium', 'Low']).default('High'), afterMinutes: z.number().int().min(0).max(120).default(5),
        instruction: z.string().min(1).max(2000).default('Compare the result with the forecast and previous figure and say what it means for the instruments that moved.'),
        maxRuns: z.number().int().min(1).max(100).default(10), expiresInDays: z.number().int().min(1).max(30).default(14), desk: DeskOption }),
      run: ({ instruction, maxRuns, expiresInDays, desk, ...rest }, ctx) => {
        const trigger = { kind: 'event' as const, ...rest };
        return tasks.create(ctx.userId, ctx.conversationId, { title: describeWatch(trigger), instruction, trigger, maxRuns, expiresInDays, desk: deskFor(desk, undefined) });
      } }, deps),
    guardedTool({ name: 'listTasks', description: 'The user\'s background tasks and alerts with their state, runs and next run.',
      input: z.looseObject({}), run: (_input, ctx) => tasks.list(ctx.userId) }, deps),
    guardedTool({ name: 'cancelTask', description: 'Cancel one of the user\'s background tasks by id.',
      input: z.strictObject({ taskId: z.uuid() }), run: (input, ctx) => tasks.setState(ctx.userId, input.taskId, 'cancelled') }, deps),
  ];
}

export interface NewsDesk { list(query: { symbol?: string | undefined; minImpact?: 'high' | 'medium' | 'low' | undefined; hours: number; limit: number }): Promise<unknown> }

/** Recent headlines from public feeds. Their text is data: an instruction inside a headline is never followed. */
export function buildNewsTools(news: NewsDesk, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'getNews',
    description: 'Recent market headlines (source, time, title, summary, url, tagged instruments, impact, likely moves, direction hint), newest first. Optionally only those mentioning one instrument, or at least a given impact.',
    input: z.strictObject({ symbol: SYMBOL.optional(), minImpact: z.enum(['high', 'medium', 'low']).optional(), hours: z.number().int().min(1).max(336).default(24), limit: z.number().int().min(1).max(30).default(15) }),
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

export interface MemoryDesk {
  remember(userId: string, note: string): Promise<unknown>;
  forget(userId: string, id: string): Promise<void>;
}

/** Lasting facts about the user, shown at the start of every turn. Never secrets, never one-off chatter. */
export function buildMemoryTools(memory: MemoryDesk, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'remember',
      description: 'Save a lasting fact about the user for future conversations (risk per trade, style, markets they trade, preferred timeframe). '
        + 'Only when they state a preference or ask you to remember; never passwords, keys or one-off details. One short sentence.',
      input: z.strictObject({ note: z.string().min(3).max(300) }), run: (o, ctx) => memory.remember(ctx.userId, o.note) }, deps),
    guardedTool({ name: 'forget', description: 'Delete a remembered fact by the id shown in brackets in "What you remember about this user".',
      input: z.strictObject({ id: z.string().min(8).max(40) }), run: async (o, ctx) => { await memory.forget(ctx.userId, o.id); return { forgotten: o.id }; } }, deps),
  ];
}

export interface CalendarDesk { list(query: CalendarQuery): Promise<unknown> }

/** Scheduled releases (CPI, payrolls, Fed, ECB…) with what each usually moves; times are UTC ISO, say them in IST. */
export function buildCalendarTools(calendar: CalendarDesk, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'getEconomicCalendar',
    description: 'Upcoming economic releases and central-bank events (title, country, time, impact, forecast, previous, what it usually moves). '
      + 'Use before planning trades around news; RBI and Indian data may be missing from this feed, say so when it matters.',
    input: CalendarQuerySchema, run: input => calendar.list(input) }, deps)];
}
