import type { DeskProposal, DeskReport } from '@aitrader/contracts';
import { DeskArgumentSchema, DeskProposalSchema, DeskReportSchema, DeskRiskReviewSchema } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { DeskRunDto } from '@aitrader/contracts';
import { AsOfDeskData, type DeskBar, type DeskSnapshot } from './desk-data';
import { DeskBacktests, decisionTime, type DeskBacktestStore, type StoredBacktest } from './desk-backtest';
import type { RoleCall } from './desk-roles';
import { TradingDesk, callsPerRun, type DeskConfig, type DeskModel, type DeskRunStore } from './trading-desk';

const asOf = Date.parse('2026-11-10T04:30:00Z');
const bar = (time: number, close = 100): DeskBar => ({ time, open: close, high: close + 1, low: close - 1, close, volume: 10 });
const news = (id: string, at: number) => ({ id, source: 'ET', title: id, url: 'https://x.test/1', summary: null, publishedAt: new Date(at).toISOString(), symbols: [], impact: 'high' as const, moves: ['NSE:NIFTY'], direction: null });
const event = (id: string, at: number) => ({ id, title: id, country: 'INR', at: new Date(at).toISOString(), impact: 'High' as const, forecast: null, previous: null, moves: [] });
const report: DeskReport = { stance: 'bullish', confidence: 0.7, summary: 's', evidence: ['e'] };
const goodProposal: DeskProposal = { action: 'BUY', confidence: 0.7, entry: 100, stopLoss: 98, target: 104, skill: 'breakout-trading', rationale: 'r' };

describe('role output schemas', () => {
  it('accept well-formed roles and reject malformed ones', () => {
    expect(DeskReportSchema.safeParse(report).success).toBe(true);
    expect(DeskReportSchema.safeParse({ ...report, stance: 'maybe' }).success).toBe(false);
    expect(DeskReportSchema.safeParse({ ...report, confidence: 1.2 }).success).toBe(false);
    expect(DeskArgumentSchema.safeParse({ side: 'bull', round: 3, argument: 'a', keyPoints: [], rebuttal: '' }).success).toBe(false);
    expect(DeskProposalSchema.safeParse(goodProposal).success).toBe(true);
    expect(DeskProposalSchema.safeParse({ ...goodProposal, action: 'SHORT' }).success).toBe(false);
    expect(DeskRiskReviewSchema.safeParse({ approve: true, reasons: [] }).success).toBe(true);
    expect(DeskRiskReviewSchema.safeParse({ approve: 'yes', reasons: [] }).success).toBe(false);
  });
});

describe('AsOfDeskData: nothing after asOf can leak', () => {
  // A source that over-returns: it ignores the cut and hands back the future as well.
  const future = asOf + 3_600_000;
  const leaky = () => {
    const bars = vi.fn<(id: string, interval: string, cursor: { before: number }, limit: number) => Promise<{ bars: DeskBar[] }>>().mockImplementation((_id, interval) => Promise.resolve({ bars: interval === '5'
      ? [bar(asOf - 600_000, 100), bar(asOf - 300_000, 101), bar(asOf - 120_000, 777), bar(asOf, 888), bar(future, 999)]
      : [bar(asOf - 2 * 86_400_000, 90), bar(asOf - 3_600_000, 95), bar(future, 999)] }));
    const compute = vi.fn<(request: { range: { before?: number | undefined } }) => Promise<never>>(() => Promise.resolve({ times: [asOf - 600_000, asOf - 300_000, asOf - 120_000, asOf, future], plots: [{ id: 'v', values: [1, 2, 3, 4, 5] }] } as never));
    const newsPort = vi.fn((q: { asOf: number }) => Promise.resolve([news('past', asOf - 3_600_000), news('now', asOf), news('later', future)].filter(() => q.asOf > 0)));
    const calendar = vi.fn(() => Promise.resolve([event('earlier', asOf - 3_600_000), event('soon', asOf + 3_600_000), event('far', asOf + 5 * 86_400_000)]));
    return { data: new AsOfDeskData({ bars }, { compute }, { list: newsPort }, { list: calendar }), bars, compute, newsPort, calendar };
  };

  it('drops bars that had not closed, later headlines, and indicator values from unfinished bars', async () => {
    const { data } = leaky();
    const s = await data.snapshot('NSE:INFY', asOf);
    expect(Math.max(...s.intraday.map(b => b.time + 300_000))).toBeLessThanOrEqual(asOf);
    expect(s.intraday.map(b => b.close)).toEqual([100, 101]);
    expect(s.lastClose).toBe(101);
    expect(s.daily.map(b => b.close)).toEqual([90]);
    expect(s.headlines.map(h => h.id)).toEqual(['now', 'past']);
    expect(Math.max(...s.headlines.map(h => Date.parse(h.publishedAt)))).toBeLessThanOrEqual(asOf);
    expect(s.indicators['rsi14']).toBe(2);
    expect(s.events.map(e => [e.id, e.released])).toEqual([['earlier', true], ['soon', false]]);
  });

  it('asks every source for data cut at asOf, never at the wall clock', async () => {
    const { data, bars, compute, newsPort, calendar } = leaky();
    await data.snapshot('NSE:INFY', asOf);
    for (const call of bars.mock.calls) expect(call[2].before).toBeLessThanOrEqual(asOf);
    for (const call of compute.mock.calls) expect(call[0].range.before).toBeLessThanOrEqual(asOf);
    expect(newsPort).toHaveBeenCalledWith(expect.objectContaining({ asOf }));
    expect(calendar).toHaveBeenCalledWith(expect.anything(), asOf);
  });
});

function setup(options: { maxTokens?: number; tokensPerCall?: number; proposal?: DeskProposal; review?: { approve: boolean; reasons: string[] }; snapshot?: Partial<DeskSnapshot> } = {}) {
  const snapshot: DeskSnapshot = { asOf, lastClose: 100, intraday: [bar(asOf - 300_000)], daily: [bar(asOf - 86_400_000)], indicators: { rsi14: 55 }, headlines: [news('h', asOf - 1000)], events: [], ...options.snapshot };
  const calls: string[] = [];
  const model: DeskModel = { generate: <T>(call: RoleCall<T>) => {
    calls.push(call.role);
    const byRole: Record<string, unknown> = { news: report, technical: report, macro: report,
      bull: { side: 'bull', round: 1, argument: 'a', keyPoints: [], rebuttal: '' }, bear: { side: 'bear', round: 1, argument: 'b', keyPoints: [], rebuttal: '' },
      trader: options.proposal ?? goodProposal, risk: options.review ?? { approve: true, reasons: ['fine'] } };
    return Promise.resolve({ data: call.schema.parse(byRole[call.role]), tokens: options.tokensPerCall ?? 1000 });
  } };
  const rows: DeskRunDto[] = [];
  const updates: string[] = [];
  const store: DeskRunStore = { insert: (_u, r) => { rows.push(structuredClone(r)); return Promise.resolve(); },
    update: (_u, r) => { updates.push(r.status); const i = rows.findIndex(x => x.id === r.id); rows[i] = structuredClone(r); return Promise.resolve(); },
    list: () => Promise.resolve(rows), get: (_u, id) => Promise.resolve(rows.find(r => r.id === id) ?? null), countSince: () => Promise.resolve(rows.length) };
  const config: DeskConfig = { maxTokens: options.maxTokens ?? 60_000, dailyRuns: 3, minRewardRisk: 1.5, maxRiskPct: 0.5, defaultCash: 1_000_000 };
  const data = { snapshot: vi.fn().mockResolvedValue(snapshot) };
  let n = 0;
  const desk = new TradingDesk(data, model, store, config, { now: () => asOf + 60_000, id: () => `00000000-0000-4000-8000-00000000000${String(++n)}`, skills: () => ['breakout-trading'], cash: () => Promise.resolve(1_000_000) });
  return { desk, calls, rows, data, updates };
}
const signal = new AbortController().signal;

describe('TradingDesk', () => {
  it('start() returns the run marked running at once and saves each step until the decision', async () => {
    const { desk, rows, updates } = setup();
    const started = await desk.start('u1', { symbol: 'NSE:INFY', asOf, rounds: 1 });
    expect(started.status).toBe('running');
    expect(rows[0]?.status).toBe('running');
    await vi.waitFor(() => { expect(rows[0]?.status).toBe('done'); });
    expect(updates.length).toBeGreaterThanOrEqual(3);
    expect((await desk.get('u1', started.id)).decision.action).toBe('BUY');
  });

  it('shows a run left running by a restart as interrupted', async () => {
    const { desk, rows } = setup();
    rows.push({ ...(await desk.run('u1', { symbol: 'NSE:INFY', asOf, rounds: 1 }, signal)), id: '00000000-0000-4000-8000-0000000000aa', status: 'running', createdAt: new Date(asOf - 10 * 60_000).toISOString() });
    expect(await desk.get('u1', '00000000-0000-4000-8000-0000000000aa')).toMatchObject({ status: 'error', error: expect.stringContaining('interrupted') as string });
  });

  it('runs analysts, one debate round, trader and risk manager, sizes by code, and stores the trail', async () => {
    const { desk, calls, rows, data } = setup();
    const run = await desk.run('u1', { symbol: 'NSE:INFY', asOf, rounds: 1 }, signal);
    expect(data.snapshot).toHaveBeenCalledWith('NSE:INFY', asOf);
    expect(calls).toEqual(expect.arrayContaining(['news', 'technical', 'macro', 'bull', 'bear', 'trader', 'risk']));
    expect(calls).toHaveLength(callsPerRun(1));
    expect(run).toMatchObject({ status: 'done', live: false, calls: 7, tokens: 7000, decision: { action: 'BUY', quantity: 2500, vetoed: false, entry: 100, stopLoss: 98, target: 104 } });
    expect(run.trail.reports.fundamentals).toEqual({ skipped: 'no fundamentals data source for this instrument' });
    expect(run.trail.debate.map(d => d.side)).toEqual(['bull', 'bear']);
    expect(rows).toHaveLength(1);
  });

  it('bounds the debate to two rounds however many are asked for', async () => {
    const two = setup();
    const run = await two.desk.run('u1', { symbol: 'NSE:INFY', asOf, rounds: 9 }, signal);
    expect(run.trail.debate).toHaveLength(4);
    expect(two.calls.filter(c => c === 'bull' || c === 'bear')).toHaveLength(4);
    const zero = setup();
    await zero.desk.run('u1', { symbol: 'NSE:INFY', asOf, rounds: 0 }, signal);
    expect(zero.calls.filter(c => c === 'bull')).toHaveLength(1);
  });

  it('the risk manager\'s veto and the code gate both turn a buy into a hold with reasons', async () => {
    const vetoed = await setup({ review: { approve: false, reasons: ['stop is inside the noise'] } }).desk.run('u1', { symbol: 'NSE:INFY', asOf, rounds: 1 }, signal);
    expect(vetoed.decision).toMatchObject({ action: 'HOLD', vetoed: true, vetoReasons: ['stop is inside the noise'], quantity: null });
    const gated = await setup({ proposal: { ...goodProposal, target: 101 } }).desk.run('u1', { symbol: 'NSE:INFY', asOf, rounds: 1 }, signal);
    expect(gated.decision).toMatchObject({ action: 'HOLD', vetoed: true });
    expect(gated.decision.vetoReasons.join(' ')).toMatch(/reward/i);
    expect(gated.trail.gate.pass).toBe(false);
  });

  it('stops at the token budget with a HOLD and says why', async () => {
    const { desk, calls } = setup({ maxTokens: 6000, tokensPerCall: 3000 });
    const run = await desk.run('u1', { symbol: 'NSE:INFY', asOf, rounds: 2 }, signal);
    expect(run.status).toBe('budget');
    expect(run.decision).toMatchObject({ action: 'HOLD' });
    expect(run.decision.summary).toContain('budget');
    expect(calls.length).toBeLessThan(callsPerRun(2));
    expect(run.tokens).toBeGreaterThanOrEqual(6000);
  });

  it('skips roles without data and decides nothing when there is no data at all', async () => {
    const { desk, calls } = setup({ snapshot: { intraday: [], daily: [], headlines: [], events: [] } });
    const run = await desk.run('u1', { symbol: 'NSE:INFY', asOf, rounds: 1 }, signal);
    expect(calls).toEqual([]);
    expect(run.decision).toMatchObject({ action: 'HOLD' });
    expect(run.trail.reports.technical).toEqual({ skipped: 'no bars before the as-of time' });
  });

  it('refuses a future as-of time and enforces the daily run cap', async () => {
    const { desk } = setup();
    await expect(desk.run('u1', { symbol: 'NSE:INFY', asOf: asOf + 3_600_000, rounds: 1 }, signal)).rejects.toThrow('future');
    const capped = setup();
    for (let i = 0; i < 3; i++) await capped.desk.run('u1', { symbol: 'NSE:INFY', asOf, rounds: 1 }, signal);
    await expect(capped.desk.run('u1', { symbol: 'NSE:INFY', asOf, rounds: 1 }, signal)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(await capped.desk.runsLeftToday('u1')).toBe(0);
  });
});

describe('DeskBacktests', () => {
  function bt() {
    const { desk } = setup();
    const saved: StoredBacktest[] = [];
    const store: DeskBacktestStore = { insert: r => { saved.push(r); return Promise.resolve(); }, save: r => { const i = saved.findIndex(s => s.id === r.id); saved[i] = r; return Promise.resolve(); },
      get: (_u, id) => Promise.resolve(saved.find(s => s.id === id) ?? null), list: () => Promise.resolve(saved) };
    // Forward bars where the target (104) is hit: scores the BUY at 100 / stop 98 / target 104 as +2R.
    const future = { after: vi.fn().mockResolvedValue([{ time: 1, open: 100, high: 105, low: 99, close: 104 }]) };
    const backtests = new DeskBacktests(desk, future, store, { now: () => Date.parse('2026-11-20T00:00:00Z'), id: () => '00000000-0000-4000-8000-0000000000bb' });
    return { backtests, saved, future };
  }
  const request = { symbol: 'NSE:INFY', dates: ['2026-11-09', '2026-11-10'], rounds: 1, interval: '5' as const, horizonBars: 75 };

  it('estimates calls and tokens before anything runs', async () => {
    const estimate = await bt().backtests.estimate('u1', request);
    expect(estimate).toEqual({ runs: 2, callsPerRun: 7, calls: 14, tokensEstimate: 56_000, dailyRunsLeft: 3 });
  });

  it('runs each date as of 10:00 IST and scores the decisions on the bars that followed', async () => {
    const { backtests, saved, future } = bt();
    const started = await backtests.start('u1', request);
    expect(started).toMatchObject({ status: 'running', progress: { done: 0, total: 2 } });
    await backtests.execute(saved[0] as StoredBacktest);
    const done = saved[0] as StoredBacktest;
    expect(done.status).toBe('done');
    expect(done.items.map(i => [i.outcome, i.r])).toEqual([['target', 2], ['target', 2]]);
    expect(done.summary).toMatchObject({ trades: 2, hitRatePct: 100, avgR: 2, totalR: 4, maxDrawdownR: 0 });
    expect(future.after).toHaveBeenCalledWith('NSE:INFY', '5', decisionTime('2026-11-09'), 75);
    expect(done.tokens).toBe(14_000);
  });

  it('refuses a date in the future, and more dates than runs left today', async () => {
    const { backtests } = bt();
    await expect(backtests.start('u1', { ...request, dates: ['2027-01-01'] })).rejects.toThrow('future');
    await expect(backtests.start('u1', { ...request, dates: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'] })).rejects.toThrow('left today');
  });
});
