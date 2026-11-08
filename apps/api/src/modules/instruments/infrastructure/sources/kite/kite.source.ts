import { Logger } from '@nestjs/common';
import type { InstrumentSource, ProviderMapping, SourceSnapshot } from '../../../application/ports/instrument-source.js';
import type { Instrument } from '../../../domain/instrument.js';
import { kolkataDate, SourceRuntime, textFetcher } from '../source-runtime.js';
import type { Clock, FetchText } from '../source-runtime.js';
import { parseKiteCsv } from './kite-csv.js';
import { mapKiteRows } from './kite-mapping.js';

export class KiteSource implements InstrumentSource {
  readonly name = 'kite';
  private readonly runtime: SourceRuntime;
  constructor(
    private readonly fetchText: FetchText = textFetcher({ 'X-Kite-Version': '3' }),
    private readonly clock: Clock = () => new Date(),
    private readonly logger: Pick<Logger, 'log'> = new Logger('KiteSource'),
  ) { this.runtime = new SourceRuntime(this.name, clock); }

  identity(mappings: readonly ProviderMapping[]): (instrument: Instrument) => string | undefined {
    const tokens = new Map(mappings.filter(m => m.provider === 'kite').map(m => [m.id, m.providerToken?.split('/')[0]]));
    return instrument => {
      const token = tokens.get(String(instrument.id));
      return token ? `${instrument.exchange}|${token}` : undefined;
    };
  }

  fetch(signal: AbortSignal): Promise<SourceSnapshot> {
    return this.runtime.run(async () => {
      const listings = await Promise.all(['NSE', 'BSE', 'MCX', 'NFO'].map(async (exchange) =>
        parseKiteCsv(await this.fetchText(`https://api.kite.trade/instruments/${exchange}`, signal))));
      const { instruments, mappings, skipped } = mapKiteRows(listings.flat(), kolkataDate(this.clock));
      this.logger.log({ skipped });
      return { instruments, mappings };
    });
  }
}
