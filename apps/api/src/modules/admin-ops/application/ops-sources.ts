import type { DataSourcesResponse } from '@aitrader/contracts';
import type { SourceHealthRecord, SourceStatus } from '../../../shared/sources';

export interface OpsSourcesPorts {
  registry: { list(): SourceStatus[] };
  health: { read(ids: string[]): Promise<Record<string, SourceHealthRecord>> };
}

const NO_HEALTH: SourceHealthRecord = { lastSuccessAt: null, lastError: null, lastErrorAt: null, lastLatencyMs: null, items24h: 0, rateLimitHits24h: 0 };

/** The admin "Data sources" view: every registered source joined with what its calls recorded. */
export class OpsSources {
  constructor(private readonly ports: OpsSourcesPorts) {}

  async list(): Promise<DataSourcesResponse> {
    const statuses = this.ports.registry.list();
    const health = await this.ports.health.read(statuses.map(s => s.descriptor.id));
    const sources = statuses.map(({ descriptor: d, state, missingKeys }) => ({
      id: d.id, owner: d.owner, kind: d.kind, markets: d.markets, envKeys: d.envKeys, state, missingKeys,
      rateLimit: d.rateLimit, schedule: d.schedule, terms: d.terms, docs: d.docs, ...(health[d.id] ?? NO_HEALTH),
    }));
    return { sources: sources.sort((a, b) => a.owner.localeCompare(b.owner) || a.id.localeCompare(b.id)) };
  }
}
