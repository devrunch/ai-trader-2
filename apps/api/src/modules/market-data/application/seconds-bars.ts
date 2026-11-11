import type { Bar } from '../domain/bar';
import { SecondsBarBuilder } from '../domain/seconds-bar-builder';
import type { SecondInterval } from '../domain/interval';
import type { LiveFeed, Tick } from './ports/live-feed';
import type { SecondsDemand, SecondsStore } from './ports/seconds-store';

interface Options { clock: () => number; log: (reason: string, error: unknown) => void; refreshMs?: number }
interface Series { builder: SecondsBarBuilder; instrumentId: string; interval: SecondInterval; lastForming: number }
const FORMING_MS = 250;

/**
 * Builds second bars from ticks in memory, only for instruments someone watches at a seconds interval,
 * and writes them to the bounded ring. Nothing here touches the candle store.
 */
export class SecondsBars {
  private readonly series = new Map<string, Series>();
  private readonly byInstrument = new Map<string, Set<Series>>();
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly store: SecondsStore, private readonly demand: SecondsDemand, private readonly deps: Options) {}

  attach(feed: LiveFeed): () => void {
    const off = feed.onTick(tick => { this.onTick(tick); });
    const refresh = () => { void this.refresh().catch((error: unknown) => { this.deps.log('seconds demand refresh failed', error); }); };
    refresh();
    const timer = setInterval(() => { refresh(); this.sweep(); }, this.deps.refreshMs ?? 5000);
    return () => { off(); clearInterval(timer); this.series.clear(); this.byInstrument.clear(); };
  }

  /** Aligns the builders with the watched pairs; a pair nobody watches loses its builder. */
  async refresh(): Promise<void> {
    const wanted = new Map((await this.demand.active()).map(item => [`${item.instrumentId}|${item.interval}`, item]));
    for (const [key, series] of this.series) if (!wanted.has(key)) { this.series.delete(key); this.byInstrument.get(series.instrumentId)?.delete(series); }
    for (const [key, { instrumentId, interval }] of wanted) {
      if (this.series.has(key)) continue;
      const series: Series = { builder: new SecondsBarBuilder(interval), instrumentId, interval, lastForming: -Infinity };
      this.series.set(key, series);
      const set = this.byInstrument.get(instrumentId) ?? new Set<Series>();
      set.add(series); this.byInstrument.set(instrumentId, set);
    }
  }

  private onTick(tick: Tick): void {
    for (const series of this.byInstrument.get(tick.instrumentId) ?? []) {
      const result = series.builder.onTick(tick);
      for (const bar of result.closed ?? []) this.write(series, 'closed', bar);
      const now = this.deps.clock();
      if (result.updated && now - series.lastForming >= FORMING_MS) { series.lastForming = now; this.write(series, 'forming', result.updated); }
    }
  }

  private sweep(): void {
    const now = this.deps.clock();
    for (const series of this.series.values()) for (const bar of series.builder.closeDue(now)) this.write(series, 'closed', bar);
  }

  private write(series: Series, kind: 'forming' | 'closed', bar: Bar): void {
    this.pending = this.pending.then(() => this.store.put(series.instrumentId, series.interval, kind, bar))
      .catch((error: unknown) => { this.deps.log('seconds bar write failed', error); });
  }
}
