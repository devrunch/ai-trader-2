import { and, asc, gte, inArray, lt } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { bars1d, bars1m } from '../../../shared/database/schema';
import type { StoredBarsReader } from '../application/ports/stored-bars-reader';
import type { Bar } from '../domain/bar';
import { dailyClock } from './drizzle-candle-store';

const QUERY_TIMEOUT_MS = 20_000;

/** One query per call for any number of instruments (the candle store's tables are keyed by instrument and time). */
export class DrizzleStoredBarsReader implements StoredBarsReader {
  constructor(private readonly db: Database) {}

  async range1d(ids: readonly string[], from: string, to: string, signal?: AbortSignal): Promise<Map<string, Bar[]>> {
    if (!ids.length) return new Map();
    const rows = await withTimeout(() => this.db.select().from(bars1d).where(and(inArray(bars1d.instrumentId, [...ids]),
      gte(bars1d.sessionDate, from), lt(bars1d.sessionDate, to))).orderBy(asc(bars1d.instrumentId), asc(bars1d.sessionDate)), QUERY_TIMEOUT_MS, signal);
    const clocks = new Map<string, ReturnType<typeof dailyClock>>();
    return group(rows.map(r => {
      const clock = clocks.get(r.instrumentId) ?? dailyClock(r.instrumentId);
      clocks.set(r.instrumentId, clock);
      return [r.instrumentId, { time: clock.start(r.sessionDate), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume }];
    }));
  }

  async range1m(ids: readonly string[], from: number, to: number, signal?: AbortSignal): Promise<Map<string, Bar[]>> {
    if (!ids.length) return new Map();
    const rows = await withTimeout(() => this.db.select().from(bars1m).where(and(inArray(bars1m.instrumentId, [...ids]),
      gte(bars1m.ts, new Date(from)), lt(bars1m.ts, new Date(to)))).orderBy(asc(bars1m.instrumentId), asc(bars1m.ts)), QUERY_TIMEOUT_MS, signal);
    return group(rows.map(r => [r.instrumentId, { time: r.ts.getTime(), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume }]));
  }
}

function group(rows: Array<[string, Bar]>): Map<string, Bar[]> {
  const out = new Map<string, Bar[]>();
  for (const [id, bar] of rows) {
    const list = out.get(id);
    if (list) list.push(bar); else out.set(id, [bar]);
  }
  return out;
}
