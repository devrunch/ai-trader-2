import type { EconomicEvent, EventScorecard, EventSpec, FundamentalsResponse, IndicatorComputeRequest, IndicatorResult, Interval, NewsItem } from '@aitrader/contracts';

export interface DeskBar { time: number; open: number; high: number; low: number; close: number; volume: number | null }
/** How an event's earlier releases moved its main instrument, from releases that had finished by the snapshot's time. */
export interface DeskScorecardSummary {
  releases: number;
  spec: EventSpec | null;
  symbol: string | null;
  /** Average percent move 15 minutes after a release with a positive / negative surprise; null when there is none of that kind. */
  avgMove15WhenBeatPct: number | null;
  avgMove15WhenMissPct: number | null;
}
export interface DeskSnapshot {
  asOf: number;
  /** Close of the last bar that had finished by `asOf`. */
  lastClose: number | null;
  intraday: DeskBar[];
  daily: DeskBar[];
  indicators: Record<string, number | null>;
  headlines: NewsItem[];
  /** Calendar events scheduled within the day before and after `asOf`; `released` is true when the scheduled time had passed. */
  events: Array<EconomicEvent & { released: boolean; scorecard?: DeskScorecardSummary }>;
  /** Company fundamentals as of `asOf` (NSE stocks); null when there is no record that existed then, or the instrument is not an NSE stock. */
  fundamentals: FundamentalsResponse | null;
}
/** Everything the desk may read, at one moment. Nothing dated after `asOf` is ever returned. */
export interface DeskData { snapshot(symbol: string, asOf: number): Promise<DeskSnapshot> }

interface BarsPort { bars(id: string, interval: Interval, cursor: { before: number }, limit: number): Promise<{ bars: DeskBar[] }> }
interface IndicatorPort { compute(request: IndicatorComputeRequest): Promise<IndicatorResult> }
interface NewsPort { list(query: { hours: number; limit: number; asOf: number }): Promise<NewsItem[]> }
interface FundamentalsPort { get(symbol: string, asOf: number): Promise<FundamentalsResponse | null> }
interface ScorecardPort { forEvents(events: Array<{ id: string; title: string; country: string }>, limit: number, asOf?: number): Promise<Map<string, EventScorecard>> }
interface CalendarPort { list(query: { days: number; impact: 'Low' }, asOf: number): Promise<EconomicEvent[]> }

const DURATION_MS: Partial<Record<Interval, number>> = { '5': 300_000, '1D': 86_400_000 };
const INTRADAY: Interval = '5';
const DAILY: Interval = '1D';
const INDICATORS: Array<{ key: string; id: string; inputs: Record<string, number> }> = [
  { key: 'rsi14', id: 'rsi', inputs: { length: 14 } }, { key: 'ema20', id: 'ema', inputs: { length: 20 } },
  { key: 'ema50', id: 'ema', inputs: { length: 50 } }, { key: 'atr14', id: 'atr', inputs: { length: 14 } },
];
const NEWS_HOURS = 48;
const SCORECARD_EVENTS = 5;
const SCORECARD_RELEASES = 8;
const IMPACT_RANK: Record<EconomicEvent['impact'], number> = { High: 3, Medium: 2, Low: 1, Holiday: 0 };

/**
 * The desk's market view at a past or present moment (FR time machine). Bars count only once they have closed, indicators are computed from bars cut before
 * `asOf`, news and events are filtered to what had happened, and every result is filtered again here so a source that over-returns cannot leak the future.
 */
export class AsOfDeskData implements DeskData {
  constructor(private readonly market: BarsPort, private readonly indicators: IndicatorPort, private readonly news: NewsPort, private readonly calendar: CalendarPort,
    private readonly fundamentals?: FundamentalsPort, private readonly scorecards?: ScorecardPort) {}

  async snapshot(symbol: string, asOf: number): Promise<DeskSnapshot> {
    const closedBy = (interval: Interval, bars: DeskBar[]): DeskBar[] => {
      const duration = DURATION_MS[interval] ?? 0;
      return bars.filter(b => b.time + duration <= asOf).sort((a, b) => a.time - b.time);
    };
    // The cursor is exclusive, so the bar that opens at the cut is not read; for the 5-minute bars the cut is the open of the bar `asOf` falls in.
    const cut = Math.floor(asOf / (DURATION_MS[INTRADAY] ?? 300_000)) * (DURATION_MS[INTRADAY] ?? 300_000);
    const [intraday, daily, news, events, fundamentals] = await Promise.all([
      this.market.bars(symbol, INTRADAY, { before: cut }, 60).then(r => closedBy(INTRADAY, r.bars)),
      this.market.bars(symbol, DAILY, { before: asOf }, 30).then(r => closedBy(DAILY, r.bars)),
      this.news.list({ hours: NEWS_HOURS, limit: 40, asOf }),
      this.calendar.list({ days: 2, impact: 'Low' }, asOf),
      this.fundamentalsAt(symbol, asOf),
    ]);
    const values: Record<string, number | null> = {};
    for (const ind of INDICATORS) values[ind.key] = await this.indicatorAt(symbol, ind, cut, asOf);
    const inWindow = events.filter(e => Math.abs(Date.parse(e.at) - asOf) <= 86_400_000).map(e => ({ ...e, released: Date.parse(e.at) <= asOf }));
    const cards = await this.scorecardsAt(inWindow, asOf);
    return {
      asOf, lastClose: intraday.at(-1)?.close ?? daily.at(-1)?.close ?? null, intraday: intraday.slice(-40), daily: daily.slice(-15), indicators: values,
      headlines: news.filter(n => Date.parse(n.publishedAt) <= asOf).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 25),
      fundamentals,
      events: inWindow.map(e => { const scorecard = cards.get(e.id); return scorecard ? { ...e, scorecard } : e; }),
    };
  }

  /** History for the most important events in the window; each card is cut again at `asOf` so a source that over-returns cannot show a release, or a move, that had not happened. */
  private async scorecardsAt(events: Array<{ id: string; title: string; country: string; at: string; impact: EconomicEvent['impact'] }>, asOf: number): Promise<Map<string, DeskScorecardSummary>> {
    const out = new Map<string, DeskScorecardSummary>();
    if (!this.scorecards || events.length === 0) return out;
    const chosen = [...events].sort((a, b) => IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact] || Math.abs(Date.parse(a.at) - asOf) - Math.abs(Date.parse(b.at) - asOf)).slice(0, SCORECARD_EVENTS);
    try {
      const cards = await this.scorecards.forEvents(chosen.map(e => ({ id: e.id, title: e.title, country: e.country })), SCORECARD_RELEASES, asOf);
      for (const e of chosen) {
        const card = cards.get(e.id);
        if (card) out.set(e.id, summarize(card, asOf));
      }
    } catch { /* history is extra context: the desk still runs without it */ }
    return out;
  }

  /** Re-checked here so a source that over-returns cannot leak a record fetched, or results published, after `asOf`. */
  private async fundamentalsAt(symbol: string, asOf: number): Promise<FundamentalsResponse | null> {
    if (!this.fundamentals || !symbol.startsWith('NSE:')) return null;
    try {
      const record = await this.fundamentals.get(symbol, asOf);
      if (!record || Date.parse(record.fetchedAt) > asOf) return null;
      if (record.reportDate !== null && Date.parse(`${record.reportDate}T23:59:59.999Z`) > asOf) return null;
      return record;
    } catch { return null; }
  }

  private async indicatorAt(symbol: string, ind: { id: string; inputs: Record<string, number> }, cut: number, asOf: number): Promise<number | null> {
    try {
      const result = await this.indicators.compute({ symbol, interval: INTRADAY, indicator: { kind: 'builtin', id: ind.id, inputs: ind.inputs }, range: { limit: 120, before: cut } });
      const plot = result.plots[0];
      if (!plot) return null;
      for (let i = result.times.length - 1; i >= 0; i--) {
        const time = result.times[i];
        const value = plot.values[i];
        if (time !== undefined && time + 300_000 <= asOf && value !== null && value !== undefined) return value;
      }
      return null;
    } catch { return null; }
  }
}

const mean = (values: number[]): number | null => (values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000);

function summarize(card: EventScorecard, asOf: number): DeskScorecardSummary {
  const past = card.releases.filter(r => Date.parse(r.at) <= asOf);
  const movesAt15 = (symbol: string) => past.flatMap(r => {
    const move = r.reactions.find(x => x.symbol === symbol)?.move15Pct;
    return move === null || move === undefined || r.surprise === null || Date.parse(r.at) + 900_000 > asOf ? [] : [{ move, surprise: r.surprise }];
  });
  const symbol = [...card.stats].sort((a, b) => b.n - a.n)[0]?.symbol ?? null;
  const rows = symbol === null ? [] : movesAt15(symbol);
  return { releases: past.length, spec: card.spec, symbol,
    avgMove15WhenBeatPct: mean(rows.filter(r => r.surprise > 0).map(r => r.move)), avgMove15WhenMissPct: mean(rows.filter(r => r.surprise < 0).map(r => r.move)) };
}
