import { BarBuilder } from '../domain/bar-builder';
import { calendarFor } from '../domain/calendar';
import type { Bar } from '../domain/bar';
import type { CandleStore } from './ports/candle-store';
import type { FormingBarStore } from './ports/forming-bar-store';
import type { LiveFeed, Tick } from './ports/live-feed';

interface BuilderState {
  builder: BarBuilder;
  pending: Promise<void>;
  latest?: { bar: Bar; lastCumVolume: number | null; seq: number | null } | undefined;
  lastWrite: number;
  timer?: ReturnType<typeof setTimeout> | undefined;
  seq: number | null;
  restored: boolean;
  unwritten: Map<number, Bar>;
  lastTickAt: number;
  lastCumVolume: number | null;
}
interface Options { clock: () => number; log: (reason: string, error: unknown) => void }
export class LiveBars {
  constructor(private readonly candles: CandleStore, private readonly forming: FormingBarStore, private readonly deps: Options) {}

  attach(feed: LiveFeed): () => void {
    const builders = new Map<string, BuilderState>();
    const off = feed.onTick(tick => {
      let state = builders.get(tick.instrumentId);
      if (!state) {
        const builder = new BarBuilder(calendarFor(tick.instrumentId.split(':')[0] ?? ''));
        state = { builder, lastWrite: -Infinity, seq: null, restored: false, unwritten: new Map(), pending: Promise.resolve(), lastTickAt: -Infinity, lastCumVolume: null };
        builders.set(tick.instrumentId, state);
      }
      const current = state;
      this.enqueue(current, () => this.consume(tick, current, feed.name));
    });
    const sweep = setInterval(() => {
      for (const [id, state] of builders) this.enqueue(state, async () => {
        await this.closed(id, state.builder.closeDue(this.deps.clock()), state, feed.name);
      });
    }, 5000);
    return () => { off(); clearInterval(sweep); for (const state of builders.values()) clearTimeout(state.timer); };
  }
  private enqueue(state: BuilderState, action: () => Promise<void>): void {
    state.pending = state.pending.then(action).catch((error: unknown) => { this.deps.log('live bar persistence failed', error); });
  }
  private async consume(tick: Tick, state: BuilderState, source: string): Promise<void> {
    if (!state.restored) {
      const saved = await this.forming.get(tick.instrumentId);
      state.builder.restore(saved?.bar ?? null, saved?.lastCumVolume ?? null);
      state.seq = saved?.seq ?? null; state.latest = saved ?? undefined; state.restored = true;
      state.lastTickAt = saved?.bar.time ?? -Infinity; state.lastCumVolume = saved?.lastCumVolume ?? null;
    }
    if (tick.seq !== undefined && state.seq !== null && tick.seq <= state.seq) return;
    const result = state.builder.onTick(tick);
    if (tick.at >= state.lastTickAt && (result.updated || result.closed)) {
      state.lastTickAt = tick.at; state.lastCumVolume = tick.cumVolume;
    }
    if (tick.seq !== undefined) state.seq = tick.seq;
    await this.closed(tick.instrumentId, result.closed ?? [], state, source);
    if (!result.updated) return;
    state.latest = { bar: result.updated, lastCumVolume: state.lastCumVolume, seq: state.seq };
    const delay = Math.max(0, state.lastWrite + 250 - this.deps.clock());
    if (!delay) await this.write(tick.instrumentId, state);
    else state.timer ??= setTimeout(() => {
      state.timer = undefined; this.enqueue(state, () => this.write(tick.instrumentId, state));
    }, delay);
  }
  private async closed(id: string, bars: Bar[], state: BuilderState, source: string): Promise<void> {
    for (const bar of bars) state.unwritten.set(bar.time, bar);
    if (!state.unwritten.size) return;
    const pending = [...state.unwritten.values()];
    // The store's (instrument, minute) key makes repeated closes and late corrections idempotent.
    await this.candles.upsert1m(id, pending, `${source}-live`);
    state.unwritten.clear();
    if (pending.some(bar => bar.time === state.latest?.bar.time)) {
      clearTimeout(state.timer); state.timer = undefined; state.latest = undefined;
      await this.forming.clear(id);
    }
  }
  private async write(id: string, state: BuilderState): Promise<void> {
    if (!state.latest) return;
    await this.forming.set(id, state.latest); state.lastWrite = this.deps.clock();
  }
}
