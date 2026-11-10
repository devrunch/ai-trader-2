import type { BarsResponse, Drawing, DrawingIntent, Interval } from '@aitrader/contracts';
import { levels, range, trendline } from '../domain/drawings';

type Cursor = { latest: true } | { before: number };
export interface DrawingBars { bars(instrumentId: string, interval: Interval, cursor: Cursor, limit: number): Promise<BarsResponse> }
const RANGE_BARS = 1000;

/** Turns the assistant's drawing intent into geometry from real bars (FR-AG-6). The model never supplies prices. */
export class DrawingService {
  constructor(private readonly market: DrawingBars) {}

  async compute(intent: DrawingIntent): Promise<Drawing> {
    const page = intent.kind === 'range'
      ? await this.market.bars(intent.symbol, intent.interval, { before: intent.to + 1 }, RANGE_BARS)
      : await this.market.bars(intent.symbol, intent.interval, { latest: true }, intent.bars);
    const bars = page.bars;
    const geometry = intent.kind === 'levels' ? levels(bars, intent.count)
      : intent.kind === 'trendline' ? trendline(bars, intent.side)
        : range(bars, intent.from, intent.to);
    return { symbol: page.instrumentId, interval: page.interval, segments: geometry.segments, note: geometry.note,
      barsUsed: bars.length, lastBarTime: bars.at(-1)?.time ?? null, status: page.status };
  }
}
