import type { Fundamentals, FundamentalsResponse } from '@aitrader/contracts';
import { retry } from '@aitrader/resilience';
import { DomainError, NotFoundError, UnavailableError, ValidationError } from '../../../shared/errors';
import { FundamentalsNotFoundError, FundamentalsParseError } from '../domain/errors';
import { isFresh, visibleAt } from '../domain/visibility';
import type { FundamentalsSource } from './ports/fundamentals-source';
import type { FundamentalsStore } from './ports/fundamentals-store';

export interface FundamentalsEnv { now: () => number; warn: (message: string, detail?: Record<string, unknown>) => void; /** Called with an upcoming results date after a record is saved; a failure here never fails the refresh. */ onResultsDate?: (symbol: string, date: string) => Promise<void> }
const SKIP_IF_FETCHED_MS = 20 * 3_600_000;
const LIVE_WINDOW_MS = 300_000;
const TICKER = /^NSE:([A-Z0-9&-]{1,20})$/;

export class FundamentalsService {
  private readonly inflight = new Map<string, Promise<Fundamentals>>();

  constructor(private readonly source: FundamentalsSource, private readonly store: FundamentalsStore, private readonly env: FundamentalsEnv) {}

  /**
   * Cached 24 h in Postgres. With `asOf` it reads the stored history only (a past view never fetches): the newest record fetched and published by then, else null.
   * When the live refresh fails the cached record is returned flagged `stale`.
   */
  async get(symbol: string, opts: { asOf?: number | undefined } = {}): Promise<FundamentalsResponse | null> {
    ticker(symbol);
    // An asOf within minutes of now is the live view: it may refresh, which a past view never does.
    if (opts.asOf !== undefined && opts.asOf < this.env.now() - LIVE_WINDOW_MS) {
      const record = await this.store.latest(symbol, opts.asOf);
      return record && visibleAt(record, opts.asOf) ? { ...record, stale: false } : null;
    }
    const cached = await this.store.latest(symbol);
    if (cached && isFresh(cached, this.env.now())) return { ...cached, stale: false };
    try {
      return { ...await this.refresh(symbol), stale: false };
    } catch (error) {
      if (cached) {
        this.env.warn('fundamentals refresh failed, serving the cached record', { symbol, error: error instanceof Error ? error.message : 'unknown' });
        return { ...cached, stale: true };
      }
      throw toDomain(error);
    }
  }

  /** Cache only, never fetches: what is stored, and the symbols that have nothing stored. */
  async getMany(symbols: string[], opts: { asOf?: number | undefined } = {}): Promise<{ found: Fundamentals[]; missing: string[] }> {
    const records = await this.store.latestMany(symbols, opts.asOf);
    const found = opts.asOf === undefined ? records : records.filter(r => visibleAt(r, opts.asOf as number));
    const have = new Set(found.map(r => r.symbol));
    return { found, missing: symbols.filter(s => !have.has(s)) };
  }

  /** Fetches and stores a fresh record: standalone first, consolidated when the company has no readable standalone page. */
  refresh(symbol: string): Promise<Fundamentals> {
    const running = this.inflight.get(symbol);
    if (running) return running;
    const started = this.fetchAndSave(symbol).finally(() => { this.inflight.delete(symbol); });
    this.inflight.set(symbol, started);
    return started;
  }

  /** Nightly pass, resumable: symbols fetched within the last 20 h are skipped. A failing symbol is counted and the pass goes on. */
  async refreshAll(symbols: string[], signal: AbortSignal): Promise<{ refreshed: number; skipped: number; failed: string[] }> {
    const recent = await this.store.fetchedSince(this.env.now() - SKIP_IF_FETCHED_MS);
    const result = { refreshed: 0, skipped: 0, failed: [] as string[] };
    const aborted = (): boolean => signal.aborted;
    for (const symbol of symbols) {
      if (aborted()) break;
      if (recent.has(symbol)) { result.skipped++; continue; }
      try {
        await retry(() => this.refresh(symbol), { retries: 2, baseMs: 2000, maxMs: 20_000, signal, retryOn: e => !(e instanceof FundamentalsNotFoundError) });
        result.refreshed++;
      } catch (error) {
        if (aborted()) break;
        result.failed.push(symbol);
        this.env.warn('fundamentals refresh failed', { symbol, error: error instanceof Error ? error.message : 'unknown' });
      }
    }
    return result;
  }

  private async fetchAndSave(symbol: string): Promise<Fundamentals> {
    const bare = ticker(symbol);
    let consolidated = false;
    let figures;
    try {
      figures = await this.source.fetch(bare, false);
    } catch (first) {
      if (!(first instanceof FundamentalsNotFoundError || first instanceof FundamentalsParseError)) throw first;
      try {
        figures = await this.source.fetch(bare, true);
        consolidated = true;
      } catch (second) {
        throw second instanceof FundamentalsNotFoundError ? first : second;
      }
    }
    const { nextResultsDate, ...rest } = figures;
    const record: Fundamentals = { symbol, consolidated, source: this.source.id, fetchedAt: new Date(this.env.now()).toISOString(), ...rest };
    await this.store.save(record);
    await this.publishResultsDate(symbol, nextResultsDate);
    return record;
  }

  private async publishResultsDate(symbol: string, date: string | null | undefined): Promise<void> {
    if (!date || !this.env.onResultsDate || Date.parse(date) < this.env.now() - 86_400_000) return;
    try { await this.env.onResultsDate(symbol, date); } catch (error) {
      this.env.warn('results date not stored in the calendar', { symbol, error: error instanceof Error ? error.message : 'unknown' });
    }
  }
}

function ticker(symbol: string): string {
  const m = TICKER.exec(symbol);
  if (!m?.[1]) throw new ValidationError('Fundamentals are available for NSE stocks only (use NSE:TICKER)', { symbol });
  return m[1];
}

function toDomain(error: unknown): Error {
  if (error instanceof DomainError) return error;
  if (error instanceof FundamentalsNotFoundError) return new NotFoundError('No fundamentals found for this company');
  return new UnavailableError('Fundamentals are not available right now');
}
