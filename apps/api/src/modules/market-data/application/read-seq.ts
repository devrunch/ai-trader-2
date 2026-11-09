import type { BarUpdate } from '@aitrader/contracts';
import type { BarSequenceStore } from './ports/bar-sequence-store';

export class ReadSeq {
  constructor(private readonly store: BarSequenceStore) {}
  current(instrumentId: string): Promise<number> { return this.store.current(instrumentId); }
  async replay(instrumentId: string, afterSeq: number): Promise<BarUpdate[]> {
    const updates = (await this.store.updates(instrumentId)).sort((a, b) => a.seq - b.seq);
    const oldest = updates[0]?.seq;
    if (oldest !== undefined && afterSeq < oldest - 1) return [];
    return updates.filter(update => update.seq > afterSeq);
  }
}
