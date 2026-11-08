import { and, desc, eq, getTableColumns, gte, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Database } from '../../../shared/database/index.js';
import { ConflictError, DomainError, UnavailableError } from '../../../shared/errors/index.js';
import { instruments, instrumentMappings, instrumentChanges, instrumentSourceStatus } from '../../../shared/database/schema/index.js';
import { InstrumentId, type Instrument, type InstrumentChange } from '../domain/index.js';
import type { InstrumentRepository } from '../application/ports/instrument-repository.js';
import type { SourceSnapshot } from '../application/ports/instrument-source.js';

const rowSchema = z.object({
  id: z.string().transform(raw => InstrumentId.parse(raw)), exchange: z.string(), ticker: z.string(), description: z.string(),
  type: z.enum(['stock', 'index', 'futures', 'option', 'forex', 'metal', 'commodity', 'etf', 'bond']),
  currency: z.string(), timezone: z.string(), session: z.string(), pricescale: z.number(), minmov: z.number(), lotSize: z.number(),
  expiry: z.string().nullable().transform(v => v ?? undefined), strike: z.number().nullable().transform(v => v ?? undefined),
  optionType: z.enum(['CE', 'PE']).nullable().transform(v => v ?? undefined),
  underlying: z.string().nullable().transform(v => v === null ? undefined : InstrumentId.parse(v)),
  isin: z.string().nullable().transform(v => v ?? undefined), sector: z.string().nullable().transform(v => v ?? undefined),
  hasIntraday: z.boolean(), volumeType: z.enum(['real', 'tick', 'none']),
  status: z.enum(['active', 'suspended', 'delisted', 'expired']), aliases: z.array(z.string()),
});
function fromRow(row: typeof instruments.$inferSelect): Instrument {
  // Omit absent optional fields: domain diffs compare field presence as well as values.
  const { expiry, strike, optionType, underlying, isin, sector, ...required } = rowSchema.parse(row);
  return { ...required, ...(expiry === undefined ? {} : { expiry }), ...(strike === undefined ? {} : { strike }),
    ...(optionType === undefined ? {} : { optionType }), ...(underlying === undefined ? {} : { underlying }),
    ...(isin === undefined ? {} : { isin }), ...(sector === undefined ? {} : { sector }) };
}
const mappingSchema = z.object({ id: z.string(), provider: z.enum(['kite', 'deriv', 'us-delayed']),
  providerSymbol: z.string(), providerToken: z.string().nullable().transform(v => v ?? undefined) });
function batches<T>(rows: readonly T[]): T[][] {
  return Array.from({ length: Math.ceil(rows.length / 1000) }, (_, i) => rows.slice(i * 1000, (i + 1) * 1000));
}
const upsertFields = Object.fromEntries(Object.entries(getTableColumns(instruments))
  .filter(([key]) => key !== 'id').map(([key, column]) => [key, sql`excluded.${sql.identifier(column.name)}`]));

export class DrizzleInstrumentRepository implements InstrumentRepository {
  constructor(private readonly db: Database, private readonly clock: () => Date = () => new Date()) {}

  async loadSource(source: string, signal?: AbortSignal): Promise<SourceSnapshot> {
    const rows = await this.read(() => this.db.select().from(instruments)
      .where(and(eq(instruments.source, source), inArray(instruments.status, ['active', 'suspended']))), signal);
    const mappings = await this.read(() => this.db.select({ id: instrumentMappings.id, provider: instrumentMappings.provider,
      providerSymbol: instrumentMappings.providerSymbol, providerToken: instrumentMappings.providerToken })
      .from(instrumentMappings).innerJoin(instruments, eq(instruments.id, instrumentMappings.id)).where(eq(instruments.source, source)), signal);
    return { instruments: rows.map(fromRow), mappings: mappings.map(row => {
      const { providerToken, ...required } = mappingSchema.parse(row);
      return { ...required, ...(providerToken === undefined ? {} : { providerToken }) };
    }) };
  }

  // Source transactions and stable IDs make repeated snapshots idempotent; history is append-only.
  // One transaction owns all batches so a late constraint failure also rolls back earlier batches.
  async applySource(source: string, snapshot: SourceSnapshot, changes: InstrumentChange[], at: string, signal?: AbortSignal): Promise<void> {
    const deadline = AbortSignal.any([AbortSignal.timeout(120000), ...(signal ? [signal] : [])]);
    try { await this.db.transaction(async tx => {
      await tx.execute(sql`set local statement_timeout = '10s'`);
      await tx.execute(sql`set local transaction_timeout = '120s'`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${source}))`);
      // Remove mappings before reusing provider symbols on renamed IDs; rollback restores them on failure.
      await tx.delete(instrumentMappings).where(inArray(instrumentMappings.id,
        tx.select({ id: instruments.id }).from(instruments).where(eq(instruments.source, source))));
      for (const batch of batches(snapshot.instruments)) {
        deadline.throwIfAborted();
        const foreign = await tx.select({ id: instruments.id }).from(instruments)
          .where(and(inArray(instruments.id, batch.map(i => String(i.id))), ne(instruments.source, source))).limit(1);
        if (foreign.length) throw new ConflictError('Instrument belongs to another source');
        await tx.insert(instruments).values(batch.map(i => ({ ...i, id: String(i.id), underlying: i.underlying?.toString(),
          aliases: [...i.aliases], status: 'active', source, updatedAt: at })))
          .onConflictDoUpdate({ target: instruments.id, set: upsertFields,
            setWhere: sql`(to_jsonb(instruments) - 'updated_at') is distinct from (to_jsonb(excluded) - 'updated_at')` });
      }
      for (const status of ['delisted', 'expired'] as const) {
        const ids = changes.filter(c => c.kind === status || (status === 'delisted' && c.kind === 'renamed')).map(c => String(c.id));
        for (const batch of batches(ids)) {
          deadline.throwIfAborted();
          await tx.update(instruments).set({ status, updatedAt: at }).where(and(eq(instruments.source, source), inArray(instruments.id, batch)));
        }
      }
      const listed = new Set(snapshot.instruments.map(i => String(i.id)));
      for (const batch of batches(snapshot.mappings)) {
        deadline.throwIfAborted();
        if (batch.some(m => !listed.has(m.id))) throw new ConflictError('Mapping does not belong to this snapshot');
        await tx.insert(instrumentMappings).values(batch);
      }
      for (const batch of batches(changes)) {
        deadline.throwIfAborted();
        await tx.insert(instrumentChanges).values(batch.map(c => ({ ...c, id: String(c.id), successor: c.successor?.toString(), source })));
      }
      deadline.throwIfAborted();
    }); } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new UnavailableError('Instrument source transaction failed');
    }
  }

  async findById(id: string, signal?: AbortSignal): Promise<Instrument | null> {
    const [row] = await this.read(() => this.db.select().from(instruments).where(eq(instruments.id, id)).limit(1), signal);
    return row ? fromRow(row) : null;
  }
  async findRenameSuccessor(id: string, signal?: AbortSignal): Promise<string | null> {
    const [row] = await this.read(() => this.db.select({ successor: instrumentChanges.successor }).from(instrumentChanges)
      .where(and(eq(instrumentChanges.id, id), eq(instrumentChanges.kind, 'renamed')))
      .orderBy(desc(instrumentChanges.at), desc(instrumentChanges.seq)).limit(1), signal);
    return row?.successor ?? null;
  }
  async listForIndex(signal?: AbortSignal): Promise<Instrument[]> {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(this.clock());
    const cutoff = new Date(`${today}T00:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const rows = await this.read(() => this.db.select().from(instruments).where(or(inArray(instruments.status, ['active', 'suspended']),
      and(eq(instruments.status, 'expired'), gte(instruments.expiry, cutoff.toISOString().slice(0, 10))))), signal);
    return rows.map(fromRow);
  }
  async listContinuousCandidates(root: string, exchange: string, signal?: AbortSignal): Promise<Instrument[]> {
    const rows = await this.read(() => this.db.select().from(instruments).where(and(eq(instruments.exchange, exchange),
      inArray(instruments.type, ['futures', 'commodity']), inArray(instruments.status, ['active', 'suspended']))), signal);
    return rows.map(fromRow).filter(i => i.underlying ? i.underlying.ticker === root : i.ticker.startsWith(root));
  }
  async setSourceStatus(source: string, s: { status: 'ok' | 'stale'; reason?: string; count?: number; at: string }, signal?: AbortSignal): Promise<void> {
    const fields = { status: s.status, reason: s.reason ?? null, lastAttemptAt: s.at,
      ...(s.status === 'ok' ? { lastSuccessAt: s.at, instrumentCount: s.count ?? 0 } : {}) };
    await this.read(() => this.db.insert(instrumentSourceStatus).values({ source, ...fields })
      .onConflictDoUpdate({ target: instrumentSourceStatus.source, set: fields }), signal);
  }
  async purgeExpired(before: string, signal?: AbortSignal): Promise<number> {
    const result = await this.read(() => this.db.delete(instruments).where(and(eq(instruments.status, 'expired'),
      inArray(instruments.type, ['futures', 'option', 'commodity']), lt(instruments.expiry, before))).returning({ id: instruments.id }), signal);
    return result.length;
  }
  private async read<T>(query: () => PromiseLike<T>, signal?: AbortSignal): Promise<T> {
    try { return await withTimeout(async abort => { abort.throwIfAborted(); return await query(); }, 10000, signal); }
    catch { throw new UnavailableError('Instrument storage unavailable'); }
  }
}
