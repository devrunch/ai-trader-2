import { describe, expect, it, vi } from 'vitest';
import { AgentTrader, BackgroundRuns, type TradeRow } from './agent-trader';
import type { AgentTask } from '../domain/agent-task';
import type { BacktestNote } from '../domain/auto-trade';
import { buildCalcTool, buildCalendarTools, buildNewsTools, buildPaperTools, buildSkillTools, buildTaskTools, buildWatchlistTools } from './power-tools';

const ctx = { userId: 'u1', conversationId: '7d9f0a2e-0000-4000-8000-000000000001', turnId: 'turn-abcdef12' };
const tenAm = Date.parse('2026-11-11T10:00:00+05:30');
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined, clock: () => tenAm };
const desk = (patch: Record<string, unknown> = {}) => ({ place: vi.fn().mockResolvedValue({ id: 'o1' }), cancel: vi.fn(), positions: vi.fn().mockResolvedValue([]),
  account: vi.fn().mockResolvedValue({ initialCash: 1_000_000, currency: 'INR' }), orders: vi.fn().mockResolvedValue([]), price: vi.fn().mockResolvedValue(1500), ...patch });
const journal = () => { const rows: TradeRow[] = []; return { rows, add: (r: TradeRow) => { rows.push(r); return Promise.resolve(); },
  countSince: (taskId: string) => Promise.resolve(rows.filter(r => r.taskId === taskId).length), list: () => Promise.resolve(rows) }; };
const trader = (d: ReturnType<typeof desk>, j = journal()) => new AgentTrader({ ...d, fills: vi.fn().mockResolvedValue([]) }, j, { now: () => tenAm, id: () => '00000000-0000-4000-8000-0000000000aa' });
const byName = <T extends { name: string }>(tools: T[], name: string) => tools.find(t => t.name === name);

describe('assistant power tools', () => {
  it('paper orders go to the paper desk for the caller, with an agent client id', async () => {
    const d = desk();
    const place = byName(buildPaperTools(trader(d), deps), 'placePaperOrder');
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'buy', type: 'market', quantity: 10, stopLoss: 1480 })).toMatchObject({ ok: true });
    expect(d.place).toHaveBeenCalledWith('u1', expect.objectContaining({ instrumentId: 'NSE:INFY', side: 'buy', product: 'MIS', quantity: 10, stopLoss: 1480,
      clientOrderId: expect.stringMatching(/^agent-turn-abc-[0-9a-f]{8}$/) as unknown }));
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'buy', type: 'limit', quantity: 10 })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('entries go through the risk gate: a missing stop or an oversized loss is blocked with the reason', async () => {
    const d = desk();
    const place = byName(buildPaperTools(trader(d), deps), 'placePaperOrder');
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'buy', type: 'market', quantity: 10 }))
      .toMatchObject({ ok: false, reason: 'VALIDATION_FAILED', detail: 'Risk check BLOCK: stop: an entry needs a stop loss' });
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'buy', type: 'market', quantity: 1000, stopLoss: 1480 }))
      .toMatchObject({ ok: false, detail: expect.stringContaining('over the per-trade limit') as unknown });
    expect(d.place).not.toHaveBeenCalled();
  });

  it('sizes the gate on the dollar account for a US stock, counting only dollar entries towards the daily loss', async () => {
    const rupeeLoss = { instrumentId: 'NSE:INFY', currency: 'INR', side: 'buy', quantity: 1000, clientOrderId: 'agent-x', status: 'filled',
      placedAt: tenAm - 60_000, limitPrice: null, fillPrice: 1500, stopLoss: 1471 };
    const d = desk({ account: vi.fn().mockResolvedValue({ initialCash: 100_000, currency: 'USD' }), orders: vi.fn().mockResolvedValue([rupeeLoss]), price: vi.fn().mockResolvedValue(200) });
    const place = byName(buildPaperTools(trader(d), deps), 'placePaperOrder');
    // $1,000 per-trade limit: 100 × $9 = $900 passes; ₹29,000 planned on INFY is another account's.
    expect(await place?.call(ctx, { symbol: 'NASDAQ:AAPL', side: 'buy', type: 'market', product: 'CNC', quantity: 100, stopLoss: 191, target: 215 })).toMatchObject({ ok: true });
    expect(d.account).toHaveBeenCalledWith('u1', 'NASDAQ:AAPL');
    expect(await place?.call(ctx, { symbol: 'NASDAQ:AAPL', side: 'buy', type: 'market', product: 'CNC', quantity: 200, stopLoss: 191, target: 215 }))
      .toMatchObject({ ok: false, detail: expect.stringContaining('over the per-trade limit') as unknown });
  });

  it('an order that only reduces an open position is an exit and skips the gate', async () => {
    const d = desk({ positions: vi.fn().mockResolvedValue([{ instrumentId: 'NSE:INFY', product: 'MIS', quantity: 10 }]) });
    const place = byName(buildPaperTools(trader(d), deps), 'placePaperOrder');
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'sell', type: 'market', quantity: 10 })).toMatchObject({ ok: true });
  });

  it('closing a position sells a long and buys back a short, at market', async () => {
    const d = desk({ positions: vi.fn().mockResolvedValue([{ instrumentId: 'NSE:INFY', product: 'MIS', quantity: -5 }]) });
    const close = byName(buildPaperTools(trader(d), deps), 'closePaperPosition');
    await close?.call(ctx, { symbol: 'NSE:INFY' });
    expect(d.place).toHaveBeenCalledWith('u1', expect.objectContaining({ side: 'buy', type: 'market', quantity: 5 }));
    expect(await close?.call(ctx, { symbol: 'NSE:TCS' })).toMatchObject({ ok: false, reason: 'VALIDATION_FAILED' });
  });

  it('no tool name suggests a real broker', () => {
    const tools = [...buildPaperTools(trader(desk()), deps), ...buildCalcTool(deps),
      ...buildSkillTools({ keys: () => [], active: vi.fn() }, deps), ...buildTaskTools({ create: vi.fn(), createAlert: vi.fn(), list: vi.fn(), setState: vi.fn() }, deps)];
    for (const { name } of tools) expect(name).not.toMatch(/broker|kite|zerodha|login|token|real|live/i);
    expect(tools.filter(t => /order|position/i.test(t.name)).every(t => /paper/i.test(t.name) && /PAPER/.test(t.description))).toBe(true);
  });

  it('calculates exactly and refuses non-arithmetic', async () => {
    const [calc] = buildCalcTool(deps);
    expect(await calc?.call(ctx, { expression: 'floor(10000 / (1325 - 1310))' })).toEqual({ ok: true, data: { expression: 'floor(10000 / (1325 - 1310))', result: 666 } });
    expect(await calc?.call(ctx, { expression: 'process.exit(1)' })).toMatchObject({ ok: false, reason: 'VALIDATION_FAILED' });
  });

  it('lists and loads versioned skills', async () => {
    const skills = { keys: () => ['system', 'skill-trend-check'], active: vi.fn().mockResolvedValue({ version: 2, content: '# Trend check\nDecide the trend from data.\n\n1. ...' }) };
    const tools = buildSkillTools(skills, deps);
    expect(await byName(tools, 'listSkills')?.call(ctx, {})).toEqual({ ok: true, data: [{ market: 'all', skills: [{ name: 'trend-check', title: 'Trend check', summary: 'Decide the trend from data.' }] }] });
    expect(await byName(tools, 'useSkill')?.call(ctx, { name: 'trend-check' })).toMatchObject({ ok: true, data: { version: 2 } });
    expect(await byName(tools, 'useSkill')?.call(ctx, { name: 'nope' })).toMatchObject({ ok: false, reason: 'VALIDATION_FAILED' });
  });

  it('groups skills by market, listing a multi-market skill under each', async () => {
    const files: Record<string, string> = { 'skill-macro': '# Macro\nRates and sessions.\nMarkets: forex, commodities\n1. x', 'skill-fno': '# F&O\nExpiry day.\nMarkets: india\n1. x', 'skill-risk': '# Risk\nSize it.\n1. x' };
    const skills = { keys: () => ['system', ...Object.keys(files)], active: (k: string) => Promise.resolve({ version: 0, content: files[k] ?? '' }) };
    const out = await byName(buildSkillTools(skills, deps), 'listSkills')?.call(ctx, {});
    expect(out).toEqual({ ok: true, data: [
      { market: 'commodities', skills: [{ name: 'macro', title: 'Macro', summary: 'Rates and sessions.' }] },
      { market: 'forex', skills: [{ name: 'macro', title: 'Macro', summary: 'Rates and sessions.' }] },
      { market: 'india', skills: [{ name: 'fno', title: 'F&O', summary: 'Expiry day.' }] },
      { market: 'all', skills: [{ name: 'risk', title: 'Risk', summary: 'Size it.' }] }] });
  });

  it('schedules tasks in the current conversation', async () => {
    const tasks = { create: vi.fn().mockResolvedValue({ id: 't' }), createAlert: vi.fn().mockResolvedValue({ id: 'a' }), list: vi.fn(), setState: vi.fn() };
    const schedule = byName(buildTaskTools(tasks, deps), 'scheduleTask');
    await schedule?.call(ctx, { title: 'Breakout', instruction: 'Buy 10', trigger: { kind: 'price', symbol: 'NSE:INFY', op: 'above', value: 1500 } });
    expect(tasks.create).toHaveBeenCalledWith('u1', ctx.conversationId, expect.objectContaining({ title: 'Breakout' }));
  });

  it('plain alerts take a price or indicator condition, never a schedule', async () => {
    const tasks = { create: vi.fn(), createAlert: vi.fn().mockResolvedValue({ id: 'a' }), list: vi.fn(), setState: vi.fn() };
    const alert = byName(buildTaskTools(tasks, deps), 'createAlert');
    const trigger = { kind: 'price', symbol: 'NSE:NIFTY', op: 'above', value: 24500 };
    expect(await alert?.call(ctx, { trigger: JSON.stringify(trigger) })).toMatchObject({ ok: true });
    expect(tasks.createAlert).toHaveBeenCalledWith('u1', { trigger, repeat: false });
    expect(await alert?.call(ctx, { trigger: { kind: 'schedule', cron: '0 9 * * 1-5', tz: 'Asia/Kolkata' } })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
    expect(tasks.create).not.toHaveBeenCalled();
  });
});

describe('nested inputs sent as JSON text', () => {
  it('a trigger sent as a JSON string is parsed; text that is not JSON is refused', async () => {
    const tasks = { create: vi.fn().mockResolvedValue({ id: 't' }), createAlert: vi.fn().mockResolvedValue({ id: 'a' }), list: vi.fn(), setState: vi.fn() };
    const schedule = byName(buildTaskTools(tasks, deps), 'scheduleTask');
    const trigger = JSON.stringify({ kind: 'schedule', cron: '*/5 * * * *', tz: 'Asia/Kolkata' });
    expect(await schedule?.call(ctx, { title: 'EURUSD', instruction: 'check', trigger })).toMatchObject({ ok: true });
    expect(tasks.create).toHaveBeenCalledWith('u1', ctx.conversationId, expect.objectContaining({ trigger: { kind: 'schedule', cron: '*/5 * * * *', tz: 'Asia/Kolkata' } }));
    expect(await schedule?.call(ctx, { title: 'x', instruction: 'y', trigger: 'every five minutes' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
});

describe('watchlist tools', () => {
  it('read, add and remove on the caller\'s own list, with canonical ids only', async () => {
    const list = { get: vi.fn().mockResolvedValue({ items: ['NSE:INFY'] }), add: vi.fn().mockResolvedValue({ items: ['NSE:INFY', 'NASDAQ:AAPL'] }), remove: vi.fn().mockResolvedValue({ items: [] }) };
    const tools = buildWatchlistTools(list, deps);
    expect(await byName(tools, 'getWatchlist')?.call(ctx, {})).toMatchObject({ ok: true, data: { items: ['NSE:INFY'] } });
    expect(await byName(tools, 'addToWatchlist')?.call(ctx, { symbol: 'NASDAQ:AAPL' })).toMatchObject({ ok: true });
    expect(list.add).toHaveBeenCalledWith('u1', 'NASDAQ:AAPL');
    expect(await byName(tools, 'removeFromWatchlist')?.call(ctx, { symbol: 'aapl' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
});

describe('news tools', () => {
  const trend = { scope: 'NSE:INFY', asOf: '2026-11-12T00:00:00.000Z', windows: [{ hours: 24, items: 2, score: 0.3, bullish: 2, bearish: 0, neutral: 0 }] };
  const desk = () => ({ list: vi.fn().mockResolvedValue([{ id: 'c1' }]), clusters: vi.fn().mockResolvedValue([{ id: 'n1', sourceCount: 3 }]), sentiment: vi.fn().mockResolvedValue(trend) });
  it('getNews returns stories with their source count, passes filters, and rejects unknown levels', async () => {
    const news = desk();
    const tool = byName(buildNewsTools(news, deps), 'getNews');
    expect(await tool?.call(ctx, { minImpact: 'high', market: 'forex' })).toMatchObject({ ok: true, data: { source: 'news feeds', clusters: [{ id: 'n1', sourceCount: 3 }] } });
    expect(news.clusters).toHaveBeenCalledWith({ minImpact: 'high', market: 'forex', hours: 24, limit: 15 });
    expect(await tool?.call(ctx, { clustered: false })).toMatchObject({ ok: true, data: { items: [{ id: 'c1' }] } });
    expect(await tool?.call(ctx, { minImpact: 'huge' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
  it('getSentiment takes a symbol or a market, never both or neither, and cites its source', async () => {
    const news = desk();
    const tool = byName(buildNewsTools(news, deps), 'getSentiment');
    expect(await tool?.call(ctx, { symbol: 'NSE:INFY' })).toMatchObject({ ok: true, data: { source: 'news feeds', windows: [{ hours: 24, score: 0.3 }] } });
    expect(news.sentiment).toHaveBeenCalledWith({ symbol: 'NSE:INFY' }, undefined);
    expect(await tool?.call(ctx, { market: 'crypto', asOf: '2026-11-12T00:00:00Z' })).toMatchObject({ ok: true });
    expect(news.sentiment).toHaveBeenLastCalledWith({ market: 'crypto' }, Date.parse('2026-11-12T00:00:00Z'));
    expect(await tool?.call(ctx, {})).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
    expect(await tool?.call(ctx, { symbol: 'NSE:INFY', market: 'india' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
  it('getCrowd asks only for crowd chatter and labels it as such', async () => {
    const news = desk();
    expect(await byName(buildNewsTools(news, deps), 'getCrowd')?.call(ctx, { market: 'us' })).toMatchObject({ ok: true, data: { source: 'reddit (crowd chatter, not news)' } });
    expect(news.list).toHaveBeenCalledWith({ market: 'us', hours: 24, limit: 15, crowd: true });
  });
});

describe('watch tools', () => {
  it('watchNews and watchEvent create the matching trigger in the caller\'s thread, with plain titles', async () => {
    const tasks = { create: vi.fn().mockResolvedValue({ id: 'x' }), createAlert: vi.fn(), list: vi.fn(), setState: vi.fn() };
    const tools = buildTaskTools(tasks, deps);
    expect(await byName(tools, 'watchNews')?.call(ctx, { markets: ['india'], keywords: ['rbi'], minImpact: 'high' })).toMatchObject({ ok: true });
    expect(tasks.create).toHaveBeenLastCalledWith('u1', ctx.conversationId, expect.objectContaining({ title: 'News: india "rbi" (high+)', maxRuns: 10, expiresInDays: 7,
      trigger: { kind: 'news', markets: ['india'], symbols: [], keywords: ['rbi'], minImpact: 'high' } }));
    expect(await byName(tools, 'watchEvent')?.call(ctx, { countries: ['INR'], title: 'policy' })).toMatchObject({ ok: true });
    expect(tasks.create).toHaveBeenLastCalledWith('u1', ctx.conversationId, expect.objectContaining({ title: 'Event: policy (INR, high+, 5 min after)',
      trigger: { kind: 'event', countries: ['INR'], title: 'policy', minImpact: 'High', afterMinutes: 5 } }));
    expect(await byName(tools, 'watchNews')?.call(ctx, { minImpact: 'extreme' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
    expect(await byName(tools, 'watchEvent')?.call(ctx, { countries: ['usa'] })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
});

const task = (patch: Partial<AgentTask> = {}): AgentTask => ({ id: 'task-1', userId: 'u1', threadId: ctx.conversationId, mode: 'agent', title: 'RBI watch', instruction: 'trade it', trigger: { kind: 'news', markets: ['india'], symbols: [], keywords: [], minImpact: 'high' },
  state: 'active', runs: 0, maxRuns: 5, armed: true, lastRunAt: null, nextRunAt: null, lastError: null, lastOutcome: null, autoTrade: null, desk: null, runState: 'idle' as const, runStateAt: null, pendingFire: null, seen: [], expiresAt: tenAm + 1e9, createdAt: tenAm - 1e6, ...patch });
const auto = { enabled: true, maxRiskPct: 0.5, maxTradesPerDay: 2, requireBacktest: false };
const note = (patch: Partial<BacktestNote> = {}): BacktestNote => ({ symbol: 'NSE:INFY', interval: '5', profitFactor: 1.6, tradeCount: 42, summary: 'INFY 5, 2000 bars: return 12%, max drawdown 6%, 42 trades', ...patch });
const entry = { symbol: 'NSE:INFY', side: 'buy' as const, type: 'market' as const, quantity: 10, stopLoss: 1480, target: 1560, rationale: 'RBI cut, banks and IT follow', skill: 'breakout-trading' };

describe('watchMove and event options', () => {
  const tasks = { create: vi.fn().mockResolvedValue({ id: 'x' }), createAlert: vi.fn(), list: vi.fn(), setState: vi.fn() };
  const tools = buildTaskTools(tasks, deps);
  it('watchMove makes a move trigger with defaults, a plain title, and a desk symbol from the universe placeholder', async () => {
    expect(await byName(tools, 'watchMove')?.call(ctx, { universe: 'nifty50', minPct: 3, desk: {} })).toMatchObject({ ok: true });
    expect(tasks.create).toHaveBeenLastCalledWith('u1', ctx.conversationId, expect.objectContaining({ title: 'Move: nifty50 3% in 15 min', maxRuns: 10, expiresInDays: 7,
      trigger: { kind: 'move', symbols: [], universe: 'nifty50', minutes: 15, minPct: 3, direction: 'either' }, desk: { symbol: 'NSE:NIFTY', rounds: 1 } }));
  });
  it('watchMove refuses a watch with no symbols and no universe', async () => {
    expect(await byName(tools, 'watchMove')?.call(ctx, { minPct: 3 })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
  it('watchEvent passes minSurprise, minSurpriseZ and briefMinutes into the trigger', async () => {
    expect(await byName(tools, 'watchEvent')?.call(ctx, { countries: ['USD'], title: 'cpi', minSurprise: 0.2, briefMinutes: 30 })).toMatchObject({ ok: true });
    expect(tasks.create).toHaveBeenLastCalledWith('u1', ctx.conversationId, expect.objectContaining({
      trigger: { kind: 'event', countries: ['USD'], title: 'cpi', minImpact: 'High', afterMinutes: 5, minSurprise: 0.2, briefMinutes: 30 } }));
    expect(await byName(tools, 'watchEvent')?.call(ctx, { briefMinutes: 2 })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
});

describe('agent orders and the trade journal', () => {
  function background(t: AgentTask, patch: Record<string, unknown> = {}) {
    const d = desk(patch);
    const j = journal();
    const runs = new BackgroundRuns();
    const propose = vi.fn().mockResolvedValue({ id: 'card-1', state: 'pending' });
    const place = byName(buildPaperTools(trader(d, j), deps, { runs, propose }), 'placePaperOrder');
    const run = (input: Record<string, unknown>, backtest: BacktestNote | null = null) => runs.during(ctx.conversationId, { task: t, reason: '1 new headline', backtest }, () => place?.call(ctx, input) ?? Promise.resolve(null));
    return { d, j, propose, run };
  }

  it('a chat entry passes the risk gate, is placed, and is journaled with the rationale and skill', async () => {
    const d = desk();
    const j = journal();
    const place = byName(buildPaperTools(trader(d, j), deps), 'placePaperOrder');
    expect(await place?.call(ctx, entry)).toMatchObject({ ok: true });
    expect(j.rows).toMatchObject([{ userId: 'u1', taskId: null, trigger: 'chat request', skill: 'breakout-trading', rationale: 'RBI cut, banks and IT follow', symbol: 'NSE:INFY',
      side: 'buy', quantity: 10, entry: 1500, stopLoss: 1480, target: 1560, riskAmount: 200, currency: 'INR', venue: 'paper', backtest: null }]);
    expect(j.rows[0]?.clientOrderId).toMatch(/^agent-turn-abc-/);
  });

  it('a blocked entry places nothing and journals nothing', async () => {
    const d = desk();
    const j = journal();
    const place = byName(buildPaperTools(trader(d, j), deps), 'placePaperOrder');
    expect(await place?.call(ctx, { ...entry, stopLoss: undefined })).toMatchObject({ ok: false, detail: expect.stringContaining('stop') as unknown });
    expect(d.place).not.toHaveBeenCalled();
    expect(j.rows).toEqual([]);
  });

  it('a background task with auto-trade on places the entry itself, journaled with the trigger', async () => {
    const { d, j, propose, run } = background(task({ autoTrade: auto }));
    expect(await run(entry, note())).toMatchObject({ ok: true });
    expect(d.place).toHaveBeenCalledTimes(1);
    expect(propose).not.toHaveBeenCalled();
    expect(j.rows).toMatchObject([{ taskId: 'task-1', trigger: 'RBI watch: 1 new headline', backtest: 'INFY 5, 2000 bars: return 12%, max drawdown 6%, 42 trades' }]);
  });

  it('auto-trade refuses a risk over the task limit, a missing backtest and a full day, and the risk gate still applies', async () => {
    const tight = background(task({ autoTrade: { ...auto, maxRiskPct: 0.01 } }));
    expect(await tight.run(entry)).toMatchObject({ ok: false, detail: expect.stringContaining('over this task') as unknown });
    const needs = background(task({ autoTrade: { ...auto, requireBacktest: true } }));
    expect(await needs.run(entry)).toMatchObject({ ok: false, detail: expect.stringContaining('runBacktest') as unknown });
    expect(await needs.run(entry, note())).toMatchObject({ ok: true });
    const capped = background(task({ autoTrade: { ...auto, maxTradesPerDay: 1 } }));
    expect(await capped.run(entry)).toMatchObject({ ok: true });
    expect(await capped.run(entry)).toMatchObject({ ok: false, detail: expect.stringContaining('already 1 trades today') as unknown });
    const noStop = background(task({ autoTrade: auto }));
    expect(await noStop.run({ ...entry, stopLoss: undefined })).toMatchObject({ ok: false, detail: expect.stringContaining('Risk check BLOCK') as unknown });
    for (const t of [tight, needs, capped, noStop]) expect(t.d.place.mock.calls.length).toBeLessThanOrEqual(1);
    expect(tight.d.place).not.toHaveBeenCalled();
  });

  it('a background task without auto-trade proposes a card for the user and places nothing', async () => {
    const { d, j, propose, run } = background(task({ autoTrade: null }));
    expect(await run(entry)).toMatchObject({ ok: true, data: { id: 'card-1', state: 'pending' } });
    expect(propose).toHaveBeenCalledWith('u1', expect.objectContaining({ kind: 'place-order', symbol: 'NSE:INFY', quantity: 10, stopLoss: 1480, clientOrderId: null }));
    expect(d.place).not.toHaveBeenCalled();
    expect(j.rows).toEqual([]);
    const off = background(task({ autoTrade: { ...auto, enabled: false } }));
    await off.run(entry);
    expect(off.propose).toHaveBeenCalledTimes(1);
  });

  it('a proposal without a stop is refused before a card is made', async () => {
    const { propose, run } = background(task());
    expect(await run({ ...entry, stopLoss: undefined })).toMatchObject({ ok: false });
    expect(propose).not.toHaveBeenCalled();
  });
});

describe('auto-trade backtest gate', () => {
  async function gated(backtest: BacktestNote | null) {
    const d = desk();
    const j = journal();
    const runs = new BackgroundRuns();
    const place = byName(buildPaperTools(trader(d, j), deps, { runs, propose: vi.fn() }), 'placePaperOrder');
    const result = await runs.during(ctx.conversationId, { task: task({ autoTrade: { ...auto, requireBacktest: true } }), reason: 'x', backtest }, () => place?.call(ctx, entry) ?? Promise.resolve(null));
    return { d, j, result };
  }

  it('enters when the backtest of this instrument had enough trades and a good profit factor', async () => {
    const { d, j, result } = await gated(note({ profitFactor: 1.1, tradeCount: 20 }));
    expect(result).toMatchObject({ ok: true });
    expect(d.place).toHaveBeenCalledTimes(1);
    expect(j.rows).toMatchObject([{ skipped: null, backtest: expect.stringContaining('42 trades') as unknown }]);
  });

  it('a profit factor under 1.1 means no trade, with the reason in the journal', async () => {
    const { d, j, result } = await gated(note({ profitFactor: 1.09 }));
    expect(result).toMatchObject({ ok: false, detail: expect.stringContaining('profit factor 1.09, below 1.1') as unknown });
    expect(d.place).not.toHaveBeenCalled();
    expect(j.rows).toMatchObject([{ skipped: expect.stringContaining('profit factor 1.09, below 1.1') as unknown, symbol: 'NSE:INFY', quantity: 10 }]);
  });

  it('fewer than 20 trades means no trade, with the reason in the journal', async () => {
    const { d, j } = await gated(note({ tradeCount: 19 }));
    expect(d.place).not.toHaveBeenCalled();
    expect(j.rows[0]?.skipped).toContain('19 trades; at least 20 are needed');
  });

  it('a backtest with no losing trade (no profit factor) passes; no backtest, or one of another instrument, blocks without a journal row', async () => {
    expect((await gated(note({ profitFactor: null }))).result).toMatchObject({ ok: true });
    const none = await gated(null);
    expect(none.result).toMatchObject({ ok: false, detail: expect.stringContaining('call runBacktest') as unknown });
    const other = await gated(note({ symbol: 'NSE:TCS' }));
    expect(other.result).toMatchObject({ ok: false, detail: expect.stringContaining('not NSE:INFY') as unknown });
    expect(none.j.rows).toEqual([]);
    expect(other.j.rows).toEqual([]);
    expect(none.d.place).not.toHaveBeenCalled();
  });
});

describe('getEconomicCalendar with a symbol', () => {
  const event = (title: string, country: string) => ({ id: title, title, country, at: '2026-11-14T10:00:00.000Z', impact: 'Medium', forecast: null, previous: null, moves: [] });
  const list = vi.fn().mockResolvedValue([event('INFY results', 'INR'), event('INFYX results', 'INR'), event('TCS results', 'INR'), event('INFY results', 'USD'), event('CPI m/m', 'USD')]);
  const tool = byName(buildCalendarTools({ list }, deps), 'getEconomicCalendar');

  it('returns only that company\'s results events, asking for rupee events of medium impact', async () => {
    const out = await tool?.call(ctx, { symbol: 'NSE:INFY', days: 14 }) as { data: { events: Array<{ title: string }> } };
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ country: 'INR', impact: 'Medium', days: 14 }));
    expect(out.data.events.map(e => e.title)).toEqual(['INFY results']);
  });

  it('says no date is known, not that none exists, when the company has no results event', async () => {
    const out = await tool?.call(ctx, { symbol: 'NSE:WIPRO' }) as { data: { events: unknown[]; note: string } };
    expect(out.data.events).toEqual([]);
    expect(out.data.note).toMatch(/no results date/i);
  });

  it('rejects a symbol outside NSE', async () => {
    expect(await tool?.call(ctx, { symbol: 'NASDAQ:AAPL' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('without a symbol keeps returning the list unchanged', async () => {
    list.mockResolvedValueOnce([event('CPI m/m', 'USD')]);
    expect(await tool?.call(ctx, { days: 3 })).toEqual({ ok: true, data: [event('CPI m/m', 'USD')] });
  });
});
