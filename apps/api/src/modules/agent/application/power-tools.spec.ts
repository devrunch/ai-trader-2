import { describe, expect, it, vi } from 'vitest';
import { buildCalcTool, buildPaperTools, buildSkillTools, buildTaskTools } from './power-tools';

const ctx = { userId: 'u1', conversationId: '7d9f0a2e-0000-4000-8000-000000000001', turnId: 'turn-abcdef12' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };
const byName = <T extends { name: string }>(tools: T[], name: string) => tools.find(t => t.name === name);

describe('assistant power tools', () => {
  it('paper orders go to the paper desk for the caller, with an agent client id', async () => {
    const desk = { place: vi.fn().mockResolvedValue({ id: 'o1' }), cancel: vi.fn(), positions: vi.fn() };
    const place = byName(buildPaperTools(desk, deps), 'placePaperOrder');
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'buy', type: 'market', quantity: 10, stopLoss: 1480 })).toMatchObject({ ok: true });
    expect(desk.place).toHaveBeenCalledWith('u1', expect.objectContaining({ instrumentId: 'NSE:INFY', side: 'buy', product: 'MIS', quantity: 10, stopLoss: 1480,
      clientOrderId: expect.stringMatching(/^agent-turn-abc-[0-9a-f]{8}$/) as unknown }));
    expect(await place?.call(ctx, { symbol: 'NSE:INFY', side: 'buy', type: 'limit', quantity: 10 })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('closing a position sells a long and buys back a short, at market', async () => {
    const desk = { place: vi.fn().mockResolvedValue({}), cancel: vi.fn(),
      positions: vi.fn().mockResolvedValue([{ instrumentId: 'NSE:INFY', product: 'MIS', quantity: -5 }]) };
    const close = byName(buildPaperTools(desk, deps), 'closePaperPosition');
    await close?.call(ctx, { symbol: 'NSE:INFY' });
    expect(desk.place).toHaveBeenCalledWith('u1', expect.objectContaining({ side: 'buy', type: 'market', quantity: 5 }));
    expect(await close?.call(ctx, { symbol: 'NSE:TCS' })).toMatchObject({ ok: false, reason: 'VALIDATION_FAILED' });
  });

  it('no tool name suggests a real broker', () => {
    const tools = [...buildPaperTools({ place: vi.fn(), cancel: vi.fn(), positions: vi.fn() }, deps), ...buildCalcTool(deps),
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
