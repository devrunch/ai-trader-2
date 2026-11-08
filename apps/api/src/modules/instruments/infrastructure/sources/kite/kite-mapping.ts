import { InstrumentId } from '../../../domain/instrument-id.js';
import type { Instrument } from '../../../domain/instrument.js';
import type { ProviderMapping, SourceSnapshot } from '../../../application/ports/instrument-source.js';
import type { KiteRow } from './kite-csv.js';

const indexAliases: Readonly<Record<string, string>> = {
  'NIFTY 50': 'NIFTY', 'NIFTY BANK': 'BANKNIFTY', 'NIFTY FIN SERVICE': 'CNXFINANCE',
  'NIFTY IT': 'CNXIT', 'INDIA VIX': 'INDIAVIX', SENSEX: 'SENSEX',
};
const segments = new Set(['NSE', 'BSE', 'INDICES', 'NFO-FUT', 'NFO-OPT', 'MCX-FUT', 'MCX-OPT']);
const types = new Set(['EQ', 'FUT', 'CE', 'PE']);
const rootTicker = (name: string) => indexAliases[name] ?? name.replaceAll(' ', '');

function providerMapping(row: KiteRow, id: string): ProviderMapping {
  // providerToken is exchange_token/instrument_token: stable rename identity plus websocket subscription token.
  return { id, provider: 'kite', providerSymbol: `${row.exchange}:${row.tradingsymbol}`, providerToken: `${row.exchange_token}/${row.instrument_token}` };
}

function identity(row: KiteRow): { exchange: string; ticker: string } {
  const exchange = row.exchange === 'NFO' ? 'NSE' : row.exchange;
  if (row.segment === 'INDICES') return { exchange, ticker: rootTicker(row.name) };
  if (row.instrument_type === 'EQ') return { exchange, ticker: row.tradingsymbol };
  const root = rootTicker(row.name);
  const month = Number(row.expiry.slice(5, 7));
  const ticker = row.instrument_type === 'FUT'
    ? `${root}${'FGHJKMNQUVXZ'[month - 1] ?? ''}${row.expiry.slice(0, 4)}`
    : `${root}${row.expiry.slice(2).replaceAll('-', '')}${row.instrument_type === 'CE' ? 'C' : 'P'}${String(row.strike)}`;
  return { exchange, ticker };
}

function mapRow(row: KiteRow, today: string): Instrument | null {
  const { exchange, ticker } = identity(row);
  const id = InstrumentId.tryParse(`${exchange}:${ticker}`);
  if (!id) return null;
  const index = row.segment === 'INDICES';
  const derivative = row.instrument_type !== 'EQ';
  const option = row.instrument_type === 'CE' || row.instrument_type === 'PE';
  return {
    id, exchange, ticker, description: row.name,
    type: index ? 'index' : option ? 'option' : derivative ? exchange === 'MCX' ? 'commodity' : 'futures' : /\bETF\b|BEES$/i.test(row.name) ? 'etf' : 'stock',
    currency: 'INR', timezone: 'Asia/Kolkata', session: '0915-1530',
    minmov: 1, pricescale: index ? 100 : Math.round(1 / row.tick_size), lotSize: row.lot_size || 1,
    hasIntraday: true, volumeType: index ? 'none' : 'real',
    status: derivative && row.expiry < today ? 'expired' : 'active',
    aliases: index ? row.name === ticker ? [] : [row.name] : derivative ? [row.tradingsymbol] : [],
    ...(derivative ? { expiry: row.expiry, underlying: InstrumentId.parse(`${exchange}:${rootTicker(row.name)}`) } : {}),
    ...(option ? { strike: row.strike, optionType: row.instrument_type === 'CE' ? 'CE' : 'PE' } : {}),
  };
}

function addContinuous(snapshot: SourceSnapshot, roots: Map<string, Instrument>): void {
  for (const [rootId, dated] of roots) {
    const root = dated.underlying;
    if (!root) continue;
    for (const rank of [1, 2]) {
      const ticker = `${root.ticker}${String(rank)}!`;
      const id = InstrumentId.parse(`${dated.exchange}:${ticker}`);
      const fields = { ...dated };
      delete fields.expiry;
      snapshot.instruments.push({ ...fields, id, ticker, status: 'active', aliases: dated.exchange === 'MCX' ? [root.ticker] : [], description: `${root.ticker} continuous (${rank === 1 ? 'front' : 'next'} month)` });
      snapshot.mappings.push({ id: id.toString(), provider: 'kite', providerSymbol: `continuous:${rootId}:${String(rank)}` });
    }
  }
}

export function mapKiteRows(rows: KiteRow[], today: string): SourceSnapshot & { skipped: number; parseFailures: number } {
  const snapshot: SourceSnapshot & { skipped: number; parseFailures: number } = { instruments: [], mappings: [], skipped: 0, parseFailures: 0 };
  const roots = new Map<string, Instrument>();
  for (const row of rows) {
    if (!segments.has(row.segment) || !types.has(row.instrument_type)) { snapshot.skipped++; continue; }
    const instrument = mapRow(row, today);
    if (!instrument) { snapshot.skipped++; snapshot.parseFailures++; continue; }
    snapshot.instruments.push(instrument);
    snapshot.mappings.push(providerMapping(row, instrument.id.toString()));
    if (row.instrument_type === 'FUT' && instrument.underlying) roots.set(instrument.underlying.toString(), instrument);
  }
  addContinuous(snapshot, roots);
  return snapshot;
}
