import type { InstrumentRepository, SourceStatusRow } from './ports/instrument-repository';

/** Per-source refresh status for the admin view (FR-AC-2). */
export class ListInstrumentSources {
  constructor(private readonly repository: InstrumentRepository) {}
  execute(signal?: AbortSignal): Promise<SourceStatusRow[]> { return this.repository.listSourceStatus(signal); }
}
