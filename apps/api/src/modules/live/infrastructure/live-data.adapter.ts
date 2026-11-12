import { SymbolNotFoundError } from '../../../shared/errors';
import type { ResolveInstrument } from '../../instruments/application/index';
import type { AggregateLiveBars, MarketDataService, ReadSeq, RequestSubscription } from '../../market-data/application/index';
import type { Interval, LiveData, SecondInterval } from '../application/ports/live-data';
import type { RedisLiveUpdateBus } from './redis-live-update-bus';

export class LiveDataAdapter implements LiveData {
  constructor(private readonly instruments: Pick<ResolveInstrument, 'execute'>,
    private readonly market: Pick<MarketDataService, 'bars'>, private readonly seq: Pick<ReadSeq, 'current' | 'replay'>,
    private readonly requests: Pick<RequestSubscription, 'acquire' | 'release' | 'acquireSeconds' | 'releaseSeconds'>, private readonly aggregateBars: Pick<AggregateLiveBars, 'execute'>,
    private readonly bus: Pick<RedisLiveUpdateBus, 'watch' | 'watchSeconds'>) {}

  async resolve(symbol: string): Promise<string | null> {
    try { const result = await this.instruments.execute(symbol); return result.instrument.id.toString(); }
    catch (error) { if (error instanceof SymbolNotFoundError) return null; throw error; }
  }
  async read(instrumentId: string, interval: Interval, limit: number) {
    const page = await this.market.bars(instrumentId, interval, { latest: true }, limit);
    return { bars: page.bars, status: page.status };
  }
  current(instrumentId: string): Promise<number> { return this.seq.current(instrumentId); }
  replay(instrumentId: string, afterSeq: number) { return this.seq.replay(instrumentId, afterSeq); }
  watch(instrumentId: string, listener: Parameters<LiveData['watch']>[1]): () => void { return this.bus.watch(instrumentId, listener); }
  acquire(instrumentId: string): Promise<void> { return this.requests.acquire(instrumentId); }
  release(instrumentId: string): Promise<void> { return this.requests.release(instrumentId); }
  acquireSeconds(instrumentId: string, interval: SecondInterval): Promise<void> { return this.requests.acquireSeconds(instrumentId, interval); }
  releaseSeconds(instrumentId: string, interval: SecondInterval): Promise<void> { return this.requests.releaseSeconds(instrumentId, interval); }
  watchSeconds(instrumentId: string, interval: SecondInterval, listener: Parameters<LiveData['watchSeconds']>[2]): () => void { return this.bus.watchSeconds(instrumentId, interval, listener); }
  aggregate(bars: Parameters<LiveData['aggregate']>[0], interval: Interval, instrumentId: string) { return this.aggregateBars.execute(bars, interval, instrumentId); }
}
