import type { InstrumentChangeKind } from '../domain/index.js';

export interface RefreshReport {
  sources: Record<string, { status: 'ok' | 'stale'; count: number;
    changes: Record<InstrumentChangeKind, number>; reason?: string }>;
}
