import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Database } from '../../../shared/database';
import { bars1d, bars1m } from '../../../shared/database/schema';
import { UnavailableError, ValidationError } from '../../../shared/errors';
import { InstrumentId } from '../../instruments/application/index';
import { calendarFor } from '../domain/calendar';
import { dateAt, localTime } from '../domain/calendars/time';
import type { CandleStore } from '../application/ports/candle-store';
import type { Bar } from '../domain/bar';

const countSchema = z.object({ repaired: z.boolean() });
const fields = { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`,
  volume: sql`excluded.volume`, source: sql`excluded.source`, repaired: sql`true` };
const changed = (table: typeof bars1m | typeof bars1d) => sql`(${table.open}, ${table.high}, ${table.low}, ${table.close}, ${table.volume})
  is distinct from (excluded.open, excluded.high, excluded.low, excluded.close, excluded.volume)
  or (excluded.repaired and not ${table.repaired})`;
function dailyClock(instrumentId: string): { date: (time: number) => string; start: (date: string) => number } {
  const id = InstrumentId.tryParse(instrumentId);
  if (!id) throw new ValidationError('Invalid instrument ID');
  let cal;
  try { cal = calendarFor(id.exchange); } catch { throw new ValidationError('Unsupported exchange'); }
  const fx = cal.id === 'FX' || cal.id === 'OANDA';
  return { date: time => dateAt(time, cal.timezone),
    start: date => fx ? localTime(date, '17:00', 'America/New_York') : localTime(date, '00:00', cal.timezone) };
}

export class DrizzleCandleStore implements CandleStore {
  constructor(private readonly db: Database) {}

  // Composite primary keys and conditional updates make duplicate deliveries no-ops.
  async upsert1m(instrumentId: string, bars: readonly Bar[], source: string, signal?: AbortSignal): Promise<{ written: number; repaired: number }> {
    return this.write(bars, batch => this.db.transaction(async tx => {
      await tx.execute(sql`set local statement_timeout = '5s'`);
      await tx.execute(sql`set local transaction_timeout = '5s'`);
      const months = new Set(batch.map(b => new Date(b.time).toISOString().slice(0, 7) + '-01'));
      // Keep the DDL advisory lock through insertion so retention cannot remove the partition between them.
      for (const month of months) await tx.execute(sql`select create_bars_1m_partition(${month}::date)`);
      return tx.insert(bars1m).values(batch.map(b => ({ ...b, instrumentId, ts: new Date(b.time), source })))
        .onConflictDoUpdate({ target: [bars1m.instrumentId, bars1m.ts], set: { ...fields, updatedAt: sql`now()` }, setWhere: changed(bars1m) })
        .returning({ repaired: bars1m.repaired });
    }), signal);
  }

  async upsert1d(instrumentId: string, bars: readonly Bar[], source: string, signal?: AbortSignal): Promise<{ written: number; repaired: number }> {
    const clock = dailyClock(instrumentId);
    return this.write(bars, batch => this.db.insert(bars1d).values(batch.map(b => ({ ...b, instrumentId,
      sessionDate: clock.date(b.time), source })))
      .onConflictDoUpdate({ target: [bars1d.instrumentId, bars1d.sessionDate], set: fields, setWhere: changed(bars1d) })
      .returning({ repaired: bars1d.repaired }), signal);
  }

  async range1m(instrumentId: string, from: number, to: number, signal?: AbortSignal): Promise<Bar[]> {
    const rows = await this.query(() => this.db.select().from(bars1m).where(and(eq(bars1m.instrumentId, instrumentId),
      gte(bars1m.ts, new Date(from)), lt(bars1m.ts, new Date(to)))).orderBy(asc(bars1m.ts)), signal);
    return rows.map(r => ({ time: r.ts.getTime(), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, repaired: r.repaired }));
  }

  async range1d(instrumentId: string, from: string, to: string, signal?: AbortSignal): Promise<Bar[]> {
    const clock = dailyClock(instrumentId);
    const rows = await this.query(() => this.db.select().from(bars1d).where(and(eq(bars1d.instrumentId, instrumentId),
      gte(bars1d.sessionDate, from), lt(bars1d.sessionDate, to))).orderBy(asc(bars1d.sessionDate)), signal);
    return rows.map(r => ({ time: clock.start(r.sessionDate), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, repaired: r.repaired }));
  }

  async earliest(instrumentId: string, daily: boolean, signal?: AbortSignal): Promise<number | null> {
    const table = daily ? bars1d : bars1m;
    const time = daily ? bars1d.sessionDate : bars1m.ts;
    const rows = await this.query(() => this.db.select({ time }).from(table).where(eq(table.instrumentId, instrumentId)).orderBy(asc(time)).limit(1), signal);
    const value = rows[0]?.time;
    return value === undefined ? null : daily ? dailyClock(instrumentId).start(String(value)) : new Date(value).getTime();
  }

  async latest1m(instrumentId: string, signal?: AbortSignal): Promise<number | null> {
    const rows = await this.query(() => this.db.select({ time: bars1m.ts }).from(bars1m).where(eq(bars1m.instrumentId, instrumentId)).orderBy(desc(bars1m.ts)).limit(1), signal);
    const value = rows[0]?.time;
    return value === undefined ? null : new Date(value).getTime();
  }

  private async write(bars: readonly Bar[], insert: (batch: readonly Bar[]) => PromiseLike<unknown[]>, signal?: AbortSignal): Promise<{ written: number; repaired: number }> {
    let written = 0; let repaired = 0;
    for (let offset = 0; offset < bars.length; offset += 1000) {
      const rows = z.array(countSchema).parse(await this.query(() => insert(bars.slice(offset, offset + 1000)), signal));
      written += rows.length; repaired += rows.filter(r => r.repaired).length;
    }
    return { written, repaired };
  }

  private async query<T>(run: () => PromiseLike<T>, signal?: AbortSignal): Promise<T> {
    try { return await withTimeout(async abort => { abort.throwIfAborted(); return await run(); }, 5000, signal); }
    catch { throw new UnavailableError('Candle storage unavailable'); }
  }
}
