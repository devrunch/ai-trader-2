import { vi } from 'vitest';
import { InstrumentId, type Instrument } from '../domain/index.js';
import type { InstrumentRepository } from './ports/instrument-repository.js';
import type { SearchIndex } from './ports/search-index.js';

export function instrument(raw = 'NSE:OLD', fields: Partial<Instrument> = {}): Instrument {
  const id = InstrumentId.parse(raw);
  return { id, exchange: id.exchange, ticker: id.ticker, description: id.ticker,
    type: 'stock', currency: 'INR', timezone: 'Asia/Kolkata', session: '0915-1530',
    pricescale: 100, minmov: 1, lotSize: 1, hasIntraday: true, volumeType: 'real',
    status: 'active', aliases: [], ...fields };
}
export function repository() {
  return { loadSource: vi.fn<InstrumentRepository['loadSource']>().mockResolvedValue({ instruments: [], mappings: [] }),
    applySource: vi.fn<InstrumentRepository['applySource']>().mockResolvedValue(undefined),
    findById: vi.fn<InstrumentRepository['findById']>().mockResolvedValue(null),
    getMapping: vi.fn<InstrumentRepository['getMapping']>().mockResolvedValue(undefined),
    findLastChange: vi.fn<InstrumentRepository['findLastChange']>().mockResolvedValue(null),
    findRenameSuccessor: vi.fn<InstrumentRepository['findRenameSuccessor']>().mockResolvedValue(null),
    listForIndex: vi.fn<InstrumentRepository['listForIndex']>().mockResolvedValue([]),
    listContinuousCandidates: vi.fn<InstrumentRepository['listContinuousCandidates']>().mockResolvedValue([]),
    setSourceStatus: vi.fn<InstrumentRepository['setSourceStatus']>().mockResolvedValue(undefined),
    purgeExpired: vi.fn<InstrumentRepository['purgeExpired']>().mockResolvedValue(0) };
}
export function index() {
  return { search: vi.fn<SearchIndex['search']>().mockReturnValue([]), rebuild: vi.fn<SearchIndex['rebuild']>(), suggest: vi.fn<SearchIndex['suggest']>().mockReturnValue([]) };
}
