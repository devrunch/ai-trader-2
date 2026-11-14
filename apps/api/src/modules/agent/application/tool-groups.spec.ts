import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { guardedTool, type GuardedTool } from './guarded-tool';
import { CORE_TOOLS, TOOL_GROUPS, ToolLoader, buildLoadTools, gateTools } from './tool-groups';

const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };
const tool = (name: string): GuardedTool<unknown, unknown> => guardedTool({ name, description: `does ${name}`, input: z.strictObject({}), run: () => Promise.resolve({ name }) }, deps);
const all = [...CORE_TOOLS, ...Object.values(TOOL_GROUPS).flat()];

describe('tool groups', () => {
  it('keeps the always-on core small and out of every group', () => {
    expect(CORE_TOOLS).toEqual(expect.arrayContaining(['getQuote', 'getBars', 'getIndicator', 'getNews', 'getEconomicCalendar', 'getPortfolio', 'presentTradePlan', 'askDesk', 'remember', 'loadTools']));
    expect(CORE_TOOLS.length).toBeLessThanOrEqual(20);
    expect(new Set(all).size).toBe(all.length);
  });

  it('names the seven groups', () => {
    expect(Object.keys(TOOL_GROUPS).sort()).toEqual(['chart', 'events', 'execution', 'news-deep', 'research', 'screening', 'strategies']);
  });

  it('offers the core until a group is loaded, then that group for the rest of that turn only', () => {
    const loader = new ToolLoader();
    expect(loader.active('t1')).toEqual(expect.arrayContaining([...CORE_TOOLS]));
    expect(loader.active('t1')).not.toContain('scanUniverse');
    loader.load('t1', 'screening');
    expect(loader.active('t1')).toContain('scanUniverse');
    expect(loader.active('t1')).not.toContain('placePaperOrder');
    expect(loader.active('t2')).not.toContain('scanUniverse');
    loader.end('t1');
    expect(loader.active('t1')).not.toContain('scanUniverse');
  });

  it('calls a grouped tool only after its group is loaded, with a reason that says how', async () => {
    const loader = new ToolLoader();
    const [scan] = gateTools([tool('scanUniverse')], loader);
    const refused = await scan?.call(ctx, {});
    expect(refused).toMatchObject({ ok: false, reason: 'NOT_LOADED' });
    expect(JSON.stringify(refused)).toContain('loadTools');
    loader.load('t1', 'screening');
    expect(await scan?.call(ctx, {})).toEqual({ ok: true, data: { name: 'scanUniverse' } });
  });

  it('never gates a core tool', async () => {
    const [quote] = gateTools([tool('getQuote')], new ToolLoader());
    expect(await quote?.call(ctx, {})).toMatchObject({ ok: true });
  });

  it('loadTools loads a group and lists what it added; an unknown group is refused', async () => {
    const loader = new ToolLoader();
    const [load] = buildLoadTools(loader, deps);
    const result = await load?.call(ctx, { group: 'screening' });
    expect(result).toMatchObject({ ok: true, data: { group: 'screening', tools: expect.arrayContaining(['scanUniverse']) as string[] } });
    expect(loader.active('t1')).toContain('scanUniverse');
    expect(await load?.call(ctx, { group: 'nonsense' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('loads a group once per turn without error when asked twice', async () => {
    const loader = new ToolLoader();
    const [load] = buildLoadTools(loader, deps);
    await load?.call(ctx, { group: 'chart' });
    expect(await load?.call(ctx, { group: 'chart' })).toMatchObject({ ok: true });
  });
});


describe('tool registry', () => {
  const registered = readdirSync(__dirname).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .flatMap(f => [...readFileSync(join(__dirname, f), 'utf8').matchAll(/guardedTool\(\{ name: '([A-Za-z]+)'/g)].map(m => m[1] ?? ''));

  it('puts every registered tool in the core or in exactly one group', () => {
    expect([...new Set(registered)].sort()).toEqual([...all].sort());
  });
});
