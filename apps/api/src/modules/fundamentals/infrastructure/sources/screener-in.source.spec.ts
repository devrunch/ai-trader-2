import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FundamentalsNotFoundError, FundamentalsParseError } from '../../domain/errors';
import { SourceUnavailableError } from '../../../../shared/sources';
import { companyUrl, SCREENER_IN, ScreenerInSource } from './screener-in.source';
import { parseScreenerPage } from './screener-in.parse';

const fixture = (name: string): string => readFileSync(join(__dirname, '__fixtures__', 'screener-in', name), 'utf8');
const clientReturning = (body: string) => {
  const get = vi.fn<(id: string, url: string) => Promise<{ status: number; text: string; headers: Headers }>>(() => Promise.resolve({ status: 200, text: body, headers: new Headers() }));
  const recordItems = vi.fn<(id: string, n: number) => Promise<void>>(() => Promise.resolve());
  return { client: { get, recordItems }, get, recordItems };
};

describe('screener-in descriptor', () => {
  it('declares the owner, the 1 request per 3 seconds limit and the terms', () => {
    expect(SCREENER_IN).toMatchObject({ id: 'screener-in', owner: 'fundamentals', rateLimit: { requests: 1, windowSec: 3 }, schedule: 'on-demand + nightly', envKeys: [],
      terms: 'company pages only, robots.txt, <= 1 request / 3 s' });
  });
});

describe('parsing a recorded company page', () => {
  const { figures } = parseScreenerPage(fixture('reliance.html'));

  it('reads the headline ratios', () => {
    expect(figures.name).toBe('Reliance Industries Ltd');
    expect(figures.ratios).toMatchObject({ marketCap: 1626611, pe: 41.5, bookValue: 1205, roe: 7.71, roce: 7.78, dividendYield: 0.5 });
  });

  it('reads sales and profit growth for 3 and 5 years', () => {
    expect(figures.ratios).toMatchObject({ salesGrowth3y: -2, salesGrowth5y: 11, profitGrowth3y: 1, profitGrowth5y: 8 });
  });

  it('derives debt to equity from the latest balance sheet when the page has no such ratio', () => {
    expect(figures.ratios.debtToEquity).toBe(0.4);
  });

  it('reads the latest shareholding for promoter, FII and DII', () => {
    expect(figures.shareholding).toEqual({ period: 'Sep 2025', promoter: 50.07, fii: 18.5, dii: 18.1, public: 13.13 });
    expect(figures.ratios).toMatchObject({ promoterHolding: 50.07, fiiHolding: 18.5, diiHolding: 18.1 });
  });

  it('reads the quarterly table and takes the report date from its newest period', () => {
    expect(figures.quarterly.map(q => q.period)).toEqual(['Dec 2024', 'Mar 2025', 'Jun 2025', 'Sep 2025']);
    expect(figures.quarterly.at(-1)).toEqual({ period: 'Sep 2025', sales: 258027, operatingProfit: 46027, opmPct: 18, netProfit: 21930, eps: 12.6 });
    expect(figures.reportDate).toBe('2025-09-30');
  });

  it('reads the annual table without the TTM column', () => {
    expect(figures.annual.map(a => a.period)).toEqual(['Mar 2023', 'Mar 2024', 'Mar 2025']);
    expect(figures.annual.at(-1)).toMatchObject({ sales: 964693, netProfit: 69648, eps: 51.5 });
  });

  it('leaves a figure the page did not show as null, not zero', () => {
    const noDebt = fixture('reliance.html').replace(/<section id="balance-sheet"[\s\S]*?<\/section>/, '');
    expect(parseScreenerPage(noDebt).figures.ratios.debtToEquity).toBeNull();
  });
});

describe('shape changed (E-source-shape)', () => {
  it('throws a typed parse error for a login wall', () => {
    expect(() => parseScreenerPage(fixture('login-wall.html'))).toThrow(FundamentalsParseError);
  });
  it('throws a typed parse error when the ratio markup is renamed, never an empty record', () => {
    expect(() => parseScreenerPage(fixture('shape-changed.html'))).toThrow(/no readable ratios/);
  });
  it('reports zero items to source health when the shape changed', async () => {
    const { client, recordItems } = clientReturning(fixture('shape-changed.html'));
    await expect(new ScreenerInSource(client).fetch('RELIANCE', false)).rejects.toBeInstanceOf(FundamentalsParseError);
    expect(recordItems).toHaveBeenCalledWith('screener-in', 0);
  });
  it('maps a not-found body and an HTTP 404 to a typed NOT_FOUND', async () => {
    await expect(new ScreenerInSource(clientReturning(fixture('not-found.html')).client).fetch('NOPE', false)).rejects.toBeInstanceOf(FundamentalsNotFoundError);
    const get = vi.fn(() => Promise.reject(new SourceUnavailableError('screener-in', 'screener-in answered HTTP 404')));
    await expect(new ScreenerInSource({ get, recordItems: vi.fn() }).fetch('NOPE', false)).rejects.toBeInstanceOf(FundamentalsNotFoundError);
  });
});

describe('robots.txt: only company pages, never a query string', () => {
  it('builds only the standalone and consolidated company URLs', () => {
    expect(companyUrl('RELIANCE', false)).toBe('https://www.screener.in/company/RELIANCE/');
    expect(companyUrl('M&M', true)).toBe('https://www.screener.in/company/M&M/consolidated/');
  });

  it.each(['RELIANCE?page=2', 'RELIANCE/?sort=roe', 'RELIANCE/../screens', '../x', 'reliance', '', 'A B', 'RELIANCE#x', 'RELIANCE&q=x/y'])('refuses %j without calling the client', async ticker => {
    const { client, get } = clientReturning('');
    await expect(new ScreenerInSource(client).fetch(ticker, false)).rejects.toThrow(/refuses/);
    await expect(new ScreenerInSource(client).fetch(ticker, true)).rejects.toThrow(/refuses/);
    expect(get).not.toHaveBeenCalled();
  });

  it('requests the exact page through the source client under the screener-in id', async () => {
    const { client, get } = clientReturning(fixture('reliance.html'));
    await new ScreenerInSource(client).fetch('RELIANCE', true);
    expect(get).toHaveBeenCalledWith('screener-in', 'https://www.screener.in/company/RELIANCE/consolidated/', expect.anything());
  });
});
