import { Logger } from '@nestjs/common';
import type { InstrumentSource, SourceSnapshot } from '../../../application/ports/instrument-source.js';
import { SourceRuntime, textFetcher } from '../source-runtime.js';
import type { Clock, FetchText } from '../source-runtime.js';
import { parseNasdaq } from './nasdaq-parse.js';

export class NasdaqSource implements InstrumentSource {
  readonly name = 'nasdaq';
  private readonly logger = new Logger('NasdaqSource');
  private readonly runtime: SourceRuntime;
  constructor(private readonly fetchText: FetchText = textFetcher(), clock: Clock = () => new Date()) {
    this.runtime = new SourceRuntime(this.name, clock);
  }
  fetch(signal: AbortSignal): Promise<SourceSnapshot> {
    return this.runtime.run(async () => {
      const snapshots = await Promise.all(['nasdaqlisted', 'otherlisted'].map(async (file) =>
        parseNasdaq(await this.fetchText(`https://www.nasdaqtrader.com/dynamic/SymDir/${file}.txt`, signal), file === 'otherlisted')));
      this.logger.log({ skipped: snapshots.reduce((count, snapshot) => count + snapshot.skipped, 0) });
      return { instruments: snapshots.flatMap((snapshot) => snapshot.instruments), mappings: snapshots.flatMap((snapshot) => snapshot.mappings) };
    });
  }
}
