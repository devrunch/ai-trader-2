import type { MarketDataService } from '../../../market-data/application/index';
import type { CandleSource } from '../../application/ports/candle-source';

const MAX_BARS = 5000;

/** FR-IN-3: `NSE:X` and `BSE:X` are different instruments in the store, so they give different bars. */
export class MarketCandleSource implements CandleSource {
  constructor(private readonly market: Pick<MarketDataService, 'bars'>) {}

  async read({ symbol, interval, from, to }: Parameters<CandleSource['read']>[0]): ReturnType<CandleSource['read']> {
    const page = await this.market.bars(symbol, interval, to === undefined ? { latest: true } : { before: to + 1 }, MAX_BARS);
    const bars = from === undefined ? page.bars : page.bars.filter(bar => bar.time >= from);
    if (bars.length > 0) return { bars };
    return { bars, reason: page.status.state === 'stale' ? page.status.reason : 'NO_DATA' };
  }
}
