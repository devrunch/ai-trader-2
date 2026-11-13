import { and, desc, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { FundamentalsSchema, type Fundamentals } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { fundamentals } from '../../../shared/database/schema';
import type { FundamentalsStore } from '../application/ports/fundamentals-store';

const DAY_MS = 86_400_000;

export class DrizzleFundamentalsStore implements FundamentalsStore {
  constructor(private readonly db: Database) {}

  async latest(symbol: string, asOf?: number): Promise<Fundamentals | null> {
    const [row] = await withTimeout(() => this.db.select({ data: fundamentals.data }).from(fundamentals)
      .where(and(inArray(fundamentals.symbol, [symbol]), ...visible(asOf))).orderBy(desc(fundamentals.fetchedAt)).limit(1), 5000);
    return row ? FundamentalsSchema.parse(row.data) : null;
  }

  async latestMany(symbols: string[], asOf?: number): Promise<Fundamentals[]> {
    if (symbols.length === 0) return [];
    const rows = await withTimeout(() => this.db.selectDistinctOn([fundamentals.symbol], { data: fundamentals.data }).from(fundamentals)
      .where(and(inArray(fundamentals.symbol, symbols), ...visible(asOf))).orderBy(fundamentals.symbol, desc(fundamentals.fetchedAt)), 10_000);
    return rows.map(r => FundamentalsSchema.parse(r.data));
  }

  async save(record: Fundamentals): Promise<void> {
    await withTimeout(() => this.db.insert(fundamentals).values({ symbol: record.symbol, consolidated: record.consolidated, source: record.source,
      fetchedAt: record.fetchedAt, reportDate: record.reportDate, data: record }).onConflictDoNothing(), 10_000);
  }

  async fetchedSince(since: number): Promise<Set<string>> {
    const rows = await withTimeout(() => this.db.selectDistinct({ symbol: fundamentals.symbol }).from(fundamentals)
      .where(gte(fundamentals.fetchedAt, new Date(since).toISOString())), 10_000);
    return new Set(rows.map(r => r.symbol));
  }
}

/** Fetched by `asOf` and results published by then: the last day of the period must be at least one day before `asOf`. */
function visible(asOf: number | undefined) {
  if (asOf === undefined) return [];
  const lastPublishedPeriod = new Date(asOf - DAY_MS + 1).toISOString().slice(0, 10);
  return [lte(fundamentals.fetchedAt, new Date(asOf).toISOString()), or(isNull(fundamentals.reportDate), lte(fundamentals.reportDate, lastPublishedPeriod))];
}
