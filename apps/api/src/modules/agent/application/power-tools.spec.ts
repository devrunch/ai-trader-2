import { describe, expect, it, vi } from 'vitest';
import { buildCalcTool, buildPaperTools, buildSkillTools, buildTaskTools } from './power-tools';

const ctx = { userId: 'u1', conversationId: '7d9f0a2e-0000-4000-8000-000000000001', turnId: 'turn-abcdef12' };
const tenAm = Date.parse('2026-11-11T10:00:00+05:30');
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined, clock: () => tenAm };
const desk = (patch: Record<string, unknown> = {}) => ({ place: vi.fn().mockResolvedValue({ id: 'o1' }), cancel: vi.fn(), positions: vi.fn().mockResolvedValue([]),
  initialCash: vi.fn().mockResolvedValue(1_000_000), orders: vi.fn().mockResolvedValue([]), price: vi.fn().mockResolvedValue(1500), ...patch });
const byName = <T extends { name: string }>(tools: T[], name: string) => tools.find(t => t.name === name);

describe('assistant power tools', () => {
  it('paper orders go to the paper desk for the caller, with an agent client id', async () => {
    const d = desk();
    const place = byName(buildPaperTools(d, deps), 'placePaperOrder');
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'buy', type: 'market', quantity: 10, stopLoss: 1480 })).toMatchObject({ ok: true });
    expect(d.place).toHaveBeenCalledWith('u1', expect.objectContaining({ instrumentId: 'NSE:INFY', side: 'buy', product: 'MIS', quantity: 10, stopLoss: 1480,
      clientOrderId: expect.stringMatching(/^agent-turn-abc-[0-9a-f]{8}$/) as unknown }));
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'buy', type: 'limit', quantity: 10 })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('entries go through the risk gate: a missing stop or an oversized loss is blocked with the reason', async () => {
    const d = desk();
    const place = byName(buildPaperTools(d, deps), 'placePaperOrder');
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'buy', type: 'market', quantity: 10 }))
      .toMatchObject({ ok: false, reason: 'VALIDATION_FAILED', detail: 'Risk check BLOCK: stop: an entry needs a stop loss' });
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'buy', type: 'market', quantity: 1000, stopLoss: 1480 }))
      .toMatchObject({ ok: false, detail: expect.stringContaining('over the per-trade limit') as unknown });
    expect(d.place).not.toHaveBeenCalled();
  });

  it('an order that only reduces an open position is an exit and skips the gate', async () => {
    const d = desk({ positions: vi.fn().mockResolvedValue([{ instrumentId: 'NSE:INFY', product: 'MIS', quantity: 10 }]) });
    const place = byName(buildPaperTools(d, deps), 'placePaperOrder');
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'sell', type: 'market', quantity: 10 })).toMatchObject({ ok: true });
  });

  it('closing a position sells a long and buys back a short, at market', async () => {
    const d = desk({ positions: vi.fn().mockResolvedValue([{ instrumentId: 'NSE:INFY', product: 'MIS', quantity: -5 }]) });
    const close = byName(buildPaperTools(d, deps), 'closePaperPosition');
    await close?.call(ctx, { symbol: 'NSE:INFY' });
    expect(d.place).toHaveBeenCalledWith('u1', expect.objectContaining({ side: 'buy', type: 'market', quantity: 5 }));
    expect(await close?.call(ctx, { symbol: 'NSE:TCS' })).toMatchObject({ ok: false, reason: 'VALIDATION_FAILED' });
  });

  it('no tool name suggests a real broker', () => {
    const tools = [...buildPaperTools(desk(), deps), ...buildCalcTool(deps),
      ...buildSkillTools({ keys: () => [], active: vi.fn() }, deps), ...buildTaskTools({ create: vi.fn(), list: vi.fn(), setState: vi.fn() }, deps)];
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
    expect(await byName(tools, 'listSkills')?.call(ctx, {})).toEqual({ ok: true, data: [{ name: 'trend-check', title: 'Trend check', summary: 'Decide the trend from data.' }] });
    expect(await byName(tools, 'useSkill')?.call(ctx, { name: 'trend-check' })).toMatchObject({ ok: true, data: { version: 2 } });
    expect(await byName(tools, 'useSkill')?.call(ctx, { name: 'nope' })).toMatchObject({ ok: false, reason: 'VALIDATION_FAILED' });
  });

  it('schedules tasks in the current conversation', async () => {
    const tasks = { create: vi.fn().mockResolvedValue({ id: 't' }), list: vi.fn(), setState: vi.fn() };
    const schedule = byName(buildTaskTools(tasks, deps), 'scheduleTask');
    await schedule?.call(ctx, { title: 'Breakout', instruction: 'Buy 10', trigger: { kind: 'price', symbol: 'NSE:INFY', op: 'above', value: 1500 } });
    expect(tasks.create).toHaveBeenCalledWith('u1', ctx.conversationId, expect.objectContaining({ title: 'Breakout' }));
  });
});

describe('nested inputs sent as JSON text', () => {
  it('a trigger sent as a JSON string is parsed; text that is not JSON is refused', async () => {
    const tasks = { create: vi.fn().mockResolvedValue({ id: 't' }), list: vi.fn(), setState: vi.fn() };
    const schedule = byName(buildTaskTools(tasks, deps), 'scheduleTask');
    const trigger = JSON.stringify({ kind: 'schedule', cron: '*/5 * * * *', tz: 'Asia/Kolkata' });
    expect(await schedule?.call(ctx, { title: 'EURUSD', instruction: 'check', trigger })).toMatchObject({ ok: true });
    expect(tasks.create).toHaveBeenCalledWith('u1', ctx.conversationId, expect.objectContaining({ trigger: { kind: 'schedule', cron: '*/5 * * * *', tz: 'Asia/Kolkata' } }));
    expect(await schedule?.call(ctx, { title: 'x', instruction: 'y', trigger: 'every five minutes' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
});
