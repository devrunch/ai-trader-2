import type { DataGapDto } from '@aitrader/contracts';

export interface GapStore {
  record(gap: { tool: string; subject: string; reason: string; example: string | null }): Promise<void>;
  list(limit: number): Promise<DataGapDto[]>;
}

/** Outcomes that are the model's or the limiter's doing, not missing data. */
const NOT_GAPS = new Set(['ok', 'INVALID_INPUT', 'RATE_LIMITED', 'NOT_LOADED', 'VALIDATION_FAILED', 'CONFLICT']);
const SUBJECT_KEYS = ['symbol', 'symbols', 'underlying', 'instrumentId', 'query', 'title', 'universe', 'countries', 'name'] as const;

/** What a call was about, in a few words: its symbol, query or title. */
export function subjectOf(args: unknown): string {
  if (typeof args !== 'object' || args === null) return '';
  const record = args as Record<string, unknown>;
  for (const key of SUBJECT_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value) return value.slice(0, 120);
    if (Array.isArray(value) && value.length) return value.map(String).join(', ').slice(0, 120);
  }
  return '';
}

/**
 * Every time the assistant asks a tool for data and gets none, the owner learns what to add. The user is never told "not available":
 * the assistant answers from what it has, and this list is where the gap goes instead.
 */
export class DataGaps {
  constructor(private readonly store: GapStore, private readonly warn: (message: string, detail: Record<string, unknown>) => void) {}

  note(entry: { tool: string; args: unknown; outcome: string; detail?: string | undefined }): void {
    if (NOT_GAPS.has(entry.outcome)) return;
    const gap = { tool: entry.tool, subject: subjectOf(entry.args), reason: entry.detail ? `${entry.outcome}: ${entry.detail}`.slice(0, 300) : entry.outcome, example: null };
    void this.store.record(gap).catch((error: unknown) => { this.warn('data gap not recorded', { tool: entry.tool, error: error instanceof Error ? error.message : String(error) }); });
  }

  list(limit = 200): Promise<DataGapDto[]> { return this.store.list(limit); }
}
