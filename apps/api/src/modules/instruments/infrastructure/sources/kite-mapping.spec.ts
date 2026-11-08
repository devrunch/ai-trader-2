import { describe, expect, it } from 'vitest';
import { parseKiteCsv } from './kite/kite-csv.js';
import { mapKiteRows } from './kite/kite-mapping.js';
import { fixture } from './source-fixtures.spec-helper.js';

const rows = ['nse', 'bse', 'nfo', 'mcx'].flatMap((exchange) => parseKiteCsv(fixture('kite', `${required(exchange)}.csv`)));
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing fixture value');
  return value;
}
const mapped = () => mapKiteRows(rows, '2026-11-09');
const instrument = (id: string) => mapped().instruments.find((entry) => entry.id.toString() === id);

describe('FR-SY-1/2/3/5, R-11 Kite mapping', () => {
  it('maps NSE equity rows to NSE:<symbol>', () => {
    const reliance = rows.find((row) => row.tradingsymbol === 'RELIANCE' && row.exchange === 'NSE');
    expect(reliance).toBeDefined();
    if (!reliance) throw new Error('fixture missing');
    expect(mapKiteRows([{ ...reliance, tick_size: 0.05 }], '2026-11-09').instruments[0]).toMatchObject({ pricescale: 20, lotSize: 1 });
    expect(instrument('NSE:RELIANCE')).toMatchObject({ pricescale: 10, currency: 'INR', timezone: 'Asia/Kolkata', session: '0915-1530', minmov: 1, hasIntraday: true, volumeType: 'real', status: 'active', aliases: [] });
    expect(instrument('NSE:ARE&M')?.ticker).toBe('ARE&M');
    expect(instrument('NSE:OMFURN-SM')?.lotSize).toBe(1200);
    expect(instrument('NSE:NIFTYBEES')).toMatchObject({ type: 'etf', pricescale: 100 });
  });
  it('maps indices to TradingView names with aliases', () => {
    for (const [id, alias] of [['NSE:NIFTY', 'NIFTY 50'], ['NSE:BANKNIFTY', 'NIFTY BANK'], ['NSE:CNXIT', 'NIFTY IT'], ['NSE:CNXFINANCE', 'NIFTY FIN SERVICE'], ['NSE:INDIAVIX', 'INDIA VIX']]) {
      expect(instrument(required(id))).toMatchObject({ type: 'index', aliases: [alias], pricescale: 100, lotSize: 1, volumeType: 'none' });
    }
    expect(instrument('BSE:SENSEX')).toMatchObject({ type: 'index', aliases: [] });
    const row = required(rows[0]);
    expect(mapKiteRows([{ ...row, name: 'NIFTY S&P', tradingsymbol: 'NIFTY S&P' }], '2026-11-09').instruments[0]?.ticker).toBe('NIFTYS&P');
  });
  it('maps NFO futures with month codes', () => {
    expect(instrument('NSE:NIFTYX2026')).toMatchObject({ type: 'futures', expiry: '2026-11-23', aliases: ['NIFTY26NOVFUT'] });
    expect(instrument('NSE:NIFTYX2026')?.underlying?.toString()).toBe('NSE:NIFTY');
  });
  it('maps NFO options with strike, expiry, type and underlying', () => {
    expect(instrument('NSE:NIFTY261109C25050')).toMatchObject({ type: 'option', strike: 25050, expiry: '2026-11-09', optionType: 'CE', aliases: ['NIFTY26N0925050CE'] });
    expect(instrument('NSE:NIFTY261109P25050')?.optionType).toBe('PE');
    expect(instrument('NSE:NIFTY261109C25050')?.underlying?.toString()).toBe('NSE:NIFTY');
    const option = required(rows.find((row) => row.instrument_type === 'CE'));
    expect(mapKiteRows([{ ...option, strike: 24050.5 }], '2026-11-09').instruments[0]?.ticker).toBe('NIFTY261109C24050.5');
  });
  it('maps MCX futures to commodity with expiry', () => {
    expect(instrument('MCX:GOLDZ2026')).toMatchObject({ type: 'commodity', expiry: '2026-12-04' });
    expect(instrument('MCX:GOLDZ2026')?.underlying?.toString()).toBe('MCX:GOLD');
    expect(instrument('MCX:GOLD261127P166000')).toMatchObject({ type: 'option', strike: 166000, optionType: 'PE' });
  });
  it('builds continuous futures ids for MCX and NFO', () => {
    for (const id of ['MCX:GOLD1!', 'MCX:GOLD2!', 'NSE:NIFTY1!', 'NSE:BANKNIFTY1!', 'NSE:RELIANCE1!']) {
      expect(instrument(id)?.expiry).toBeUndefined();
      expect(instrument(id)).toBeDefined();
      const [exchange, ticker] = id.split(':');
      expect(mapped().mappings.find((mapping) => mapping.id === id)?.providerSymbol).toBe(`continuous:${required(exchange)}:${required(ticker).slice(0, -2)}:${required(ticker).slice(-2, -1)}`);
    }
    expect(instrument('MCX:GOLD1!')?.description).toBe('GOLD continuous (front month)');
    expect(instrument('MCX:GOLD2!')?.description).toBe('GOLD continuous (next month)');
  });
  it('mapping tokens encode exchange and instrument tokens', () => {
    expect(mapped().mappings.find((mapping) => mapping.id === 'NSE:RELIANCE')).toEqual({ id: 'NSE:RELIANCE', provider: 'kite', providerSymbol: 'NSE:RELIANCE', providerToken: '2885/738561' });
  });
  it('skips unsupported rows and counts them', () => {
    const row = required(rows[0]);
    expect(mapKiteRows([{ ...row, instrument_type: 'BOND' }, { ...row, segment: 'CDS' }, { ...row, tradingsymbol: '\u0001', segment: 'NSE' }], '2026-11-09')).toMatchObject({ instruments: [], mappings: [], skipped: 3, parseFailures: 1 });
  });
  it('parses quoted commas, escaped quotes, CRLF and embedded newlines', () => {
    const header = required(fixture('kite', 'nse.csv').split('\n')[0]);
    const csv = `${header}\r\n1,2,TEST,"A, B ""Ltd""\nCompany",0,,0,0.05,1,EQ,NSE,NSE\r\n`;
    expect(parseKiteCsv(csv)[0]?.name).toBe('A, B "Ltd"\nCompany');
  });
});
