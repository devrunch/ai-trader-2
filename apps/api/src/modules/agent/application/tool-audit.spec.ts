import { describe, expect, it, vi } from 'vitest';
import { buildIndicatorTools } from './action-tools';
import { buildBacktestTools } from './backtest-tools';
import { buildDepthTools } from './depth-tools';
import { buildMarketStatusTools } from './market-status-tools';
import { buildNewsTools } from './power-tools';
import { buildReadTools } from './read-tools';

const ctx = { userId: 'u1', conversationId: '7d9f0a2e-0000-4000-8000-000000000001', turnId: 'turn-abcdef12' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };

/** One instrument per asset class the app trades. */
const CLASSES = [
  { name: 'India equity', symbol: 'NSE:RELIANCE' }, { name: 'India F&O', symbol: 'NSE:NIFTY1!' }, { name: 'forex', symbol: 'FX:EURUSD' }, { name: 'metals', symbol: 'OANDA:XAUUSD' },
  { name: 'MCX commodity', symbol: 'MCX:CRUDEOIL1!' }, { name: 'US equity', symbol: 'NASDAQ:AAPL' }, { name: 'crypto', symbol: 'CRYPTO:BTCUSD' },
] as const;

const find = <T extends { name: string }>(tools: T[], name: string): T => {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool;
};
const indicatorResult = { instrumentId: 'x', interval: '15', ref: 'builtin:rsi@1', inputs: {}, times: [1, 2], plots: [{ id: 'rsi', values: [50, 51] }], status: { state: 'ok' } };

describe.each(CLASSES)('agent tools work for $name ($symbol)', ({ symbol }) => {
  it('reads quotes, bars, indicators, depth, news, sentiment and market status', async () => {
    const quote = vi.fn().mockResolvedValue({ price: 1 });
    const bars = vi.fn().mockResolvedValue({ bars: [] });
    const read = buildReadTools({ quote: { execute: quote }, market: { bars }, search: { execute: vi.fn() }, portfolio: { account: vi.fn(), positions: vi.fn(), orders: vi.fn() } }, deps);
    expect(await find(read, 'getQuote').call(ctx, { symbol })).toMatchObject({ ok: true });
    expect(await find(read, 'getBars').call(ctx, { symbol, interval: '15' })).toMatchObject({ ok: true });
    expect(quote).toHaveBeenCalledWith(symbol);
    expect(bars).toHaveBeenCalledWith(symbol, '15', { latest: true }, 200);

    const compute = vi.fn().mockResolvedValue(indicatorResult);
    expect(await find(buildIndicatorTools({ list: () => [], compute }, deps), 'getIndicator').call(ctx, { symbol, interval: '15', indicatorId: 'rsi' })).toMatchObject({ ok: true });
    expect(compute).toHaveBeenCalledWith(expect.objectContaining({ symbol }));

    const depth = vi.fn().mockResolvedValue({ depth: null, unavailable: 'No order book for this instrument' });
    expect(await find(buildDepthTools({ read: depth }, deps), 'getDepth').call(ctx, { symbol })).toMatchObject({ ok: true, data: { available: false } });

    const news = { list: vi.fn().mockResolvedValue([]), clusters: vi.fn().mockResolvedValue([]), sentiment: vi.fn().mockResolvedValue({}) };
    const newsTools = buildNewsTools(news, deps);
    expect(await find(newsTools, 'getNews').call(ctx, { symbol })).toMatchObject({ ok: true });
    expect(await find(newsTools, 'getSentiment').call(ctx, { symbol })).toMatchObject({ ok: true });
    expect(news.sentiment).toHaveBeenCalledWith({ symbol }, undefined);

    expect(await find(buildMarketStatusTools(deps), 'getMarketStatus').call(ctx, { target: symbol, at: Date.parse('2026-11-12T14:00:00Z') })).toMatchObject({ ok: true, data: { summary: expect.stringContaining(symbol.split(':')[0] ?? '') as string } });
  });

  it('backtests the instrument', async () => {
    const run = vi.fn().mockResolvedValue({ sample: { symbol, interval: '15', bars: 500 }, costs: {}, metrics: { totalReturnPct: 1, maxDrawdownPct: 1, tradeCount: 30, profitFactor: 1.4 }, inSample: {}, outOfSample: {}, signals: {}, trades: [] });
    const tools = buildBacktestTools({ runner: { run }, strategies: { create: vi.fn() } }, deps);
    const spec = { symbol, interval: '15', bars: 500, strategy: { entry: { kind: 'compare', left: { kind: 'series', name: 'close' }, op: 'gt', right: { kind: 'value', value: 1 } } } };
    expect(await find(tools, 'runBacktest').call(ctx, spec)).toMatchObject({ ok: true });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ symbol }));
  });
});

describe('getMarketStatus', () => {
  const status = (target: string, at: string) => find(buildMarketStatusTools(deps), 'getMarketStatus').call(ctx, { target, at: Date.parse(at) });
  it('says an NSE holiday is closed and names it', async () => {
    expect(await status('NSE', '2026-01-26T05:00:00Z')).toMatchObject({ ok: true, data: { open: false, closedReason: 'holiday', holiday: 'Republic Day' } });
  });
  it('says forex is closed after the Friday 22:00 UTC close and gives the Sunday reopen', async () => {
    expect(await status('FX', '2026-11-13T23:00:00Z')).toMatchObject({ ok: true, data: { open: false, nextOpen: '2026-11-15T22:00:00.000Z' } });
  });
  it('says crypto is always open', async () => {
    expect(await status('CRYPTO', '2026-11-14T03:00:00Z')).toMatchObject({ ok: true, data: { open: true, nextClose: null } });
  });
  it('returns a reason for an exchange with no calendar', async () => {
    expect(await status('NOPE', '2026-11-14T03:00:00Z')).toMatchObject({ ok: true, data: { available: false } });
  });
});
