import type { SourceClient, SourceDescriptor } from '../../../../shared/sources';

export const NSE_INDICES_DESCRIPTOR: SourceDescriptor = {
  id: 'nse-indices', owner: 'instruments', kind: 'index constituents', markets: ['NSE'], envKeys: [],
  rateLimit: { requests: 6, windowSec: 60 }, schedule: '30 6 * * 1',
  terms: 'archives.nseindia.com/content/indices/ind_<index>list.csv, the public constituent files NSE publishes for each index; fetched weekly, three files.',
  docs: 'https://www.niftyindices.com/indices/equity/broad-based-indices',
};

export type NseIndex = 'nifty50' | 'nifty100' | 'nifty500';
export interface Constituent { /** Canonical id, NSE:<SYMBOL>. */ id: string; name: string }

const FILES: Record<NseIndex, string> = { nifty50: 'ind_nifty50list.csv', nifty100: 'ind_nifty100list.csv', nifty500: 'ind_nifty500list.csv' };
const REQUIRED = ['Company Name', 'Symbol'] as const;

class NseIndicesShapeError extends Error { override readonly name = 'NseIndicesShapeError'; }

function cells(line: string): string[] {
  const out: string[] = [];
  let cell = ''; let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cell.trim()); cell = ''; } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

/** Parses one constituent file. A file without the expected header or without rows is an error: the format changed, or NSE served an error page. */
export function parseConstituents(csv: string): Constituent[] {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const header = cells(lines[0] ?? '');
  const column = (name: string): number => header.indexOf(name);
  if (REQUIRED.some(name => column(name) < 0)) throw new NseIndicesShapeError(`constituent file has no ${REQUIRED.join(' / ')} columns`);
  const seen = new Set<string>();
  const rows: Constituent[] = [];
  for (const line of lines.slice(1)) {
    const row = cells(line);
    const symbol = row[column('Symbol')];
    if (!symbol || !/^[A-Z0-9&-]+$/.test(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    rows.push({ id: `NSE:${symbol}`, name: row[column('Company Name')] ?? symbol });
  }
  if (!rows.length) throw new NseIndicesShapeError('constituent file has no rows');
  return rows;
}

/** NSE index constituents through the shared source client. */
export class NseIndicesSource {
  constructor(private readonly client: Pick<SourceClient, 'get' | 'recordItems'>) {}

  async fetch(index: NseIndex, signal: AbortSignal): Promise<Constituent[]> {
    const { text } = await this.client.get(NSE_INDICES_DESCRIPTOR.id, `https://archives.nseindia.com/content/indices/${FILES[index]}`, { signal });
    const rows = parseConstituents(text);
    await this.client.recordItems(NSE_INDICES_DESCRIPTOR.id, rows.length);
    return rows;
  }
}
