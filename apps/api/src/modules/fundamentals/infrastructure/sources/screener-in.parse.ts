import type { FundamentalPeriod, FundamentalRatios } from '@aitrader/contracts';
import { FundamentalsNotFoundError, FundamentalsParseError } from '../../domain/errors';
import { periodEnd } from '../../domain/visibility';
import type { FundamentalsFigures } from '../../application/ports/fundamentals-source';

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string): string => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
  if (name.startsWith('#')) {
    const code = name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  }
  return ENTITIES[name.toLowerCase()] ?? whole;
});
const text = (fragment: string): string => decode(fragment.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** "1,202", "₹ 16,26,611 Cr.", "-2%" and "0.50 %" all read as numbers; anything else is null. */
function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[₹,%\s]|Cr\.?/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

const section = (raw: string, id: string): string => new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`).exec(raw)?.[0] ?? '';

interface Table { periods: string[]; rows: Map<string, string[]> }
function table(html: string): Table {
  const grid = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(tr => [...(tr[1] ?? '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => text(c[1] ?? '')));
  const [head = [], ...body] = grid;
  const rows = new Map<string, string[]>();
  for (const [label, ...cells] of body) if (label) rows.set(label.replace(/\s*\+$/, ''), cells);
  return { periods: head.slice(1), rows };
}
const firstTable = (html: string): Table => table(/<table[\s\S]*?<\/table>/.exec(html)?.[0] ?? '');

function cell(t: Table, labels: string[], index: number): number | null {
  for (const label of labels) {
    const row = t.rows.get(label);
    if (row) return num(row[index]);
  }
  return null;
}
const latest = (t: Table, labels: string[]): number | null => cell(t, labels, t.periods.length - 1);

function periods(t: Table, monthsOnly: boolean): FundamentalPeriod[] {
  return t.periods.flatMap((period, i) => {
    if (monthsOnly && periodEnd(period) === null) return [];
    return [{ period, sales: cell(t, ['Sales', 'Revenue'], i), operatingProfit: cell(t, ['Operating Profit', 'Financing Profit'], i), opmPct: cell(t, ['OPM %', 'Financing Margin %'], i),
      netProfit: cell(t, ['Net Profit'], i), eps: cell(t, ['EPS in Rs'], i) }];
  }).slice(-12);
}

const TOP_RATIOS: Record<string, keyof FundamentalRatios> = { 'Market Cap': 'marketCap', 'Stock P/E': 'pe', 'Book Value': 'bookValue', 'ROE': 'roe', 'ROCE': 'roce', 'Dividend Yield': 'dividendYield', 'Debt to equity': 'debtToEquity' };

function growth(raw: string, heading: string, years: string): number | null {
  for (const block of raw.matchAll(/<table[^>]*class="ranges-table"[^>]*>([\s\S]*?)<\/table>/g)) {
    const title = text(/<th[^>]*>([\s\S]*?)<\/th>/.exec(block[1] ?? '')?.[1] ?? '');
    if (title !== heading) continue;
    const rows = [...(block[1] ?? '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(tr => [...(tr[1] ?? '').matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => text(c[1] ?? '')));
    const row = rows.find(r => r[0]?.replace(/:$/, '') === years);
    return num(row?.[1]);
  }
  return null;
}

/** Whether the page says the company does not exist (a 200 body that screener serves for some unknown tickers). */
const isNotFoundPage = (raw: string): boolean => /<title>\s*Page not found/i.test(raw);

/**
 * Reads a screener.in company page. Throws FundamentalsParseError when none of the headline ratios can be found: that means the markup moved or a
 * login wall was served, and an empty record would read as a company with no earnings.
 */
export function parseScreenerPage(raw: string): { figures: FundamentalsFigures; ratiosFound: number } {
  if (isNotFoundPage(raw)) throw new FundamentalsNotFoundError('screener.in has no such company');
  const ratios: FundamentalRatios = { marketCap: null, pe: null, bookValue: null, roe: null, roce: null, dividendYield: null, debtToEquity: null,
    salesGrowth3y: null, salesGrowth5y: null, profitGrowth3y: null, profitGrowth5y: null, promoterHolding: null, fiiHolding: null, diiHolding: null };
  const top = /<ul[^>]*id="top-ratios"[^>]*>([\s\S]*?)<\/ul>/.exec(raw)?.[1] ?? '';
  let found = 0;
  for (const li of top.matchAll(/<li[^>]*>\s*<span class="name">([\s\S]*?)<\/span>([\s\S]*?)<\/li>/g)) {
    const key = TOP_RATIOS[text(li[1] ?? '')];
    const value = num(/<span class="number">([^<]*)<\/span>/.exec(li[2] ?? '')?.[1]);
    if (key && value !== null) { ratios[key] = value; found++; }
  }
  if (found === 0) throw new FundamentalsParseError('screener.in returned a page with no readable ratios: the markup has probably changed or a login page was served');

  ratios.salesGrowth3y = growth(raw, 'Compounded Sales Growth', '3 Years');
  ratios.salesGrowth5y = growth(raw, 'Compounded Sales Growth', '5 Years');
  ratios.profitGrowth3y = growth(raw, 'Compounded Profit Growth', '3 Years');
  ratios.profitGrowth5y = growth(raw, 'Compounded Profit Growth', '5 Years');

  const balance = firstTable(section(raw, 'balance-sheet'));
  const equity = (latest(balance, ['Equity Capital']) ?? 0) + (latest(balance, ['Reserves']) ?? 0);
  const borrowings = latest(balance, ['Borrowings']);
  if (ratios.debtToEquity === null && borrowings !== null && equity > 0) ratios.debtToEquity = Math.round((borrowings / equity) * 100) / 100;

  const holdingBlock = /<div[^>]*id="quarterly-shp"[\s\S]*?<\/table>/.exec(section(raw, 'shareholding'))?.[0] ?? section(raw, 'shareholding');
  const holders = firstTable(holdingBlock);
  const shareholding = { period: holders.periods.at(-1) ?? null, promoter: latest(holders, ['Promoters']), fii: latest(holders, ['FIIs']), dii: latest(holders, ['DIIs']), public: latest(holders, ['Public']) };
  ratios.promoterHolding = shareholding.promoter;
  ratios.fiiHolding = shareholding.fii;
  ratios.diiHolding = shareholding.dii;

  const quarterly = periods(firstTable(section(raw, 'quarters')), true);
  const annual = periods(firstTable(section(raw, 'profit-loss')), true);
  const title = text(/<title>([^<]*)<\/title>/.exec(raw)?.[1] ?? '').split('|')[0]?.replace(/share price/i, '').trim();
  const name = title || text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(raw)?.[1] ?? '') || null;
  const reportDate = quarterly.length > 0 ? periodEnd(quarterly[quarterly.length - 1]?.period ?? '') : null;
  return { figures: { name, reportDate, ratios, quarterly, annual, shareholding }, ratiosFound: found };
}
