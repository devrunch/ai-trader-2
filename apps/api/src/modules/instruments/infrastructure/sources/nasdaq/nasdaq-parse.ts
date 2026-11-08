import { InstrumentId } from '../../../domain/instrument-id.js';
import type { SourceSnapshot } from '../../../application/ports/instrument-source.js';
import { ValidationError } from '../../../../../shared/errors/index.js';

const exchanges: Readonly<Record<string, string>> = { N: 'NYSE', A: 'AMEX', P: 'NYSEARCA', Z: 'CBOE', V: 'IEX' };

export function parseNasdaq(text: string, other: boolean): SourceSnapshot & { skipped: number; parseFailures: number } {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = header?.split('|') ?? [];
  const symbolColumn = other ? 'ACT Symbol' : 'Symbol';
  if (![symbolColumn, 'Security Name', 'Test Issue', 'ETF', ...(other ? ['Exchange'] : [])].every((key) => columns.includes(key))) {
    throw new ValidationError('Invalid Nasdaq listing header');
  }
  const snapshot: SourceSnapshot & { skipped: number; parseFailures: number } = { instruments: [], mappings: [], skipped: 0, parseFailures: 0 };
  for (const line of lines) {
    if (!line || line.startsWith('File Creation Time:')) continue;
    const cells = line.split('|');
    const field = (key: string) => cells[columns.indexOf(key)] ?? '';
    const exchange = other ? exchanges[field('Exchange')] : 'NASDAQ';
    if (field('Test Issue') === 'Y' || !exchange) { snapshot.skipped++; continue; }
    const ticker = field(symbolColumn);
    const id = InstrumentId.tryParse(`${exchange}:${ticker}`);
    if (!id) { snapshot.skipped++; snapshot.parseFailures++; continue; }
    snapshot.instruments.push({
      id, exchange, ticker, description: field('Security Name'), type: field('ETF') === 'Y' ? 'etf' : 'stock',
      currency: 'USD', timezone: 'America/New_York', session: '0930-1600', pricescale: 100,
      minmov: 1, lotSize: 1, volumeType: 'real', hasIntraday: true, status: 'active', aliases: [],
    });
    snapshot.mappings.push({ id: id.toString(), provider: 'us-delayed', providerSymbol: ticker });
  }
  return snapshot;
}
