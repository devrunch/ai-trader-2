import type { BarUpdate } from '@aitrader/contracts';
import type { BarSequenceStore } from './ports/bar-sequence-store';

export class ReadSeq {
  constructor(private readonly store: BarSequenceStore) {}
  current(instrumentId: string): Promise<number> { return this.store.current(instrumentId); }
  async replay(instrumentId: string, afterSeq: number): Promise<BarUpdate[] | null> {
    const updates = (await this.store.updates(instrumentId)).sort((a, b) => a.seq - b.seq);
    const current = await this.store.current(instrumentId);
    const oldest = updates[0]?.seq;
    if (oldest !== undefined && afterSeq < oldest - 1) return null;
    if (oldest === undefined) return afterSeq < current ? null : [];
    const replay = updates.filter(update => update.seq > afterSeq);
    let expected = afterSeq + 1;
    for (const update of replay) {
      if (update.seq !== expected) return null;
      expected++;
    }
    return replay.at(-1)?.seq !== current && afterSeq < current ? null : replay;
  }
}
