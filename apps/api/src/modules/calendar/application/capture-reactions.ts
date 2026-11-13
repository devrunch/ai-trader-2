import type { EventReaction } from '@aitrader/contracts';
import { movesFor } from '../domain/moves';
import { reactionFromBars, type ReactionBar } from '../domain/reaction';
import type { ReactionStore } from './ports/reaction-store';

/** Stored 1-minute bars; satisfied by market-data's MinuteBars. */
export interface MinuteWindow { window(symbols: string[], from: number, to: number): Promise<Map<string, ReactionBar[]>> }

const MIN = 60_000;
/** The +60 minute bar must be stored; events older than three days stop being retried. */
const MIN_AGE_MS = 65 * MIN;
const MAX_AGE_MS = 3 * 86_400_000;

/** Records how each released event's instruments moved. Safe to run twice: events with stored rows are skipped and rows are keyed (event, symbol). */
export class CaptureReactions {
  constructor(private readonly store: ReactionStore, private readonly bars: MinuteWindow, private readonly clock: () => number = Date.now) {}

  /** Returns the number of events stored. */
  async run(): Promise<number> {
    const now = this.clock();
    const due = await this.store.withoutReactions(now - MAX_AGE_MS, now - MIN_AGE_MS);
    let stored = 0;
    for (const e of due) {
      const symbols = movesFor(e.country, e.title).filter(m => m.includes(':'));
      if (symbols.length === 0) continue;
      const at = Date.parse(e.at);
      const start = Math.floor(at / MIN) * MIN;
      const windows = await this.bars.window(symbols, start, start + 60 * MIN);
      const rows: EventReaction[] = symbols.map(symbol => ({ symbol, ...reactionFromBars(windows.get(symbol) ?? [], at) }));
      // Without any reference price the bars are not stored yet: leave the event for the next run.
      if (rows.every(r => r.refPrice === null)) continue;
      await this.store.save(e.id, rows, now);
      stored++;
    }
    return stored;
  }
}
