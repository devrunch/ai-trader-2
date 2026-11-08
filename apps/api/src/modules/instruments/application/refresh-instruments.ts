import { diffMasters, type InstrumentChangeKind } from '../domain/index.js';
import type { InstrumentRepository } from './ports/instrument-repository.js';
import type { InstrumentSource } from './ports/instrument-source.js';
import type { SearchIndex } from './ports/search-index.js';

export interface RefreshReport {
  sources: Record<string, { status: 'ok' | 'stale'; count: number;
    changes: Record<InstrumentChangeKind, number>; reason?: string }>;
}
const counts = (): Record<InstrumentChangeKind, number> => ({ listed: 0, renamed: 0, delisted: 0, expired: 0, updated: 0 });

export class RefreshInstruments {
  constructor(private readonly repository: InstrumentRepository, private readonly sources: readonly InstrumentSource[],
    private readonly index: SearchIndex, private readonly clock: () => Date = () => new Date(),
    private readonly logger: { warn(message: unknown): void } = console) {}

  async execute(signal: AbortSignal): Promise<RefreshReport> {
    const at = this.clock().toISOString();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(at));
    const report: RefreshReport = { sources: {} };
    for (const source of this.sources) {
      signal.throwIfAborted();
      try {
        const fetched = await source.fetch(signal);
        const snapshot = { ...fetched, instruments: fetched.instruments.map(i => ({ ...i, status: 'active' as const })) };
        const prev = await this.repository.loadSource(source.name);
        const previousKey = source.identity?.(prev.mappings);
        const nextKey = source.identity?.(snapshot.mappings);
        const previousIdentity = new Map(prev.instruments.map(i => [String(i.id), previousKey?.(i)]));
        const nextIdentity = new Map(snapshot.instruments.map(i => [String(i.id), nextKey?.(i)]));
        const localAt = new Date(new Date(at).getTime() + 330 * 60000).toISOString().replace('Z', '+05:30');
        const changes = diffMasters(prev.instruments, snapshot.instruments, localAt,
          i => nextIdentity.get(String(i.id)) ?? previousIdentity.get(String(i.id))).map(change => ({ ...change, at }));
        signal.throwIfAborted();
        await this.repository.applySource(source.name, snapshot, changes, at);
        await this.repository.setSourceStatus(source.name, { status: 'ok', count: snapshot.instruments.length, at });
        const totals = counts(); for (const change of changes) totals[change.kind]++;
        report.sources[source.name] = { status: 'ok', count: snapshot.instruments.length, changes: totals };
      } catch (error) {
        const reason = (error instanceof Error ? error.message : String(error)).slice(0, 200);
        this.logger.warn({ source: source.name, reason });
        try { await this.repository.setSourceStatus(source.name, { status: 'stale', reason, at }); }
        catch { this.logger.warn({ source: source.name, reason: 'Unable to persist stale source status' }); }
        report.sources[source.name] = { status: 'stale', count: 0, changes: counts(), reason };
      }
    }
    signal.throwIfAborted();
    const cutoff = new Date(`${today}T00:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    await this.repository.purgeExpired(cutoff.toISOString().slice(0, 10));
    this.index.rebuild(await this.repository.listForIndex());
    return report;
  }
}
