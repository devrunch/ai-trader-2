import { SymbolNotFoundError, ValidationError } from '../../../shared/errors/index.js';
import { InstrumentId, parseContinuous, resolveContinuous, type Instrument } from '../domain/index.js';
import type { InstrumentRepository } from './ports/instrument-repository.js';
import type { SearchIndex } from './ports/search-index.js';

export type ResolvedInstrument = { instrument: Instrument; via?: 'renamed' | 'continuous'; resolvedFrom?: string };

export class ResolveInstrument {
  constructor(private readonly repository: InstrumentRepository, private readonly index: SearchIndex,
    private readonly clock: () => Date = () => new Date()) {}

  async execute(raw: string, today?: string): Promise<ResolvedInstrument> {
    let id: InstrumentId;
    try { id = InstrumentId.parse(raw); }
    catch { throw new ValidationError('Invalid instrument ID', { id: raw }); }
    const continuous = parseContinuous(id);
    if (continuous) {
      const candidates = await this.repository.listContinuousCandidates(continuous.root, id.exchange);
      const date = today ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(this.clock());
      const instrument = resolveContinuous(continuous.root, continuous.rank, candidates, date);
      if (!instrument) throw this.notFound(raw, id.ticker);
      return { instrument, via: 'continuous', resolvedFrom: raw };
    }
    let instrument = await this.repository.findById(String(id));
    if (!instrument) {
      const change = await this.repository.findLastChange(String(id));
      const error = this.notFound(raw, id.ticker);
      if (change?.kind === 'expired' || change?.kind === 'delisted') {
        throw new SymbolNotFoundError(error.message, { ...error.details, reason: change.kind, at: change.at });
      }
      throw error;
    }
    const visited = new Set([String(instrument.id)]);
    let renamed = false;
    for (let hop = 0; hop < 5 && instrument.status === 'delisted'; hop++) {
      const successorId = await this.repository.findRenameSuccessor(String(instrument.id));
      if (!successorId || visited.has(successorId)) break;
      const successor = await this.repository.findById(successorId);
      if (!successor) break;
      visited.add(successorId); instrument = successor; renamed = true;
    }
    return renamed ? { instrument, via: 'renamed', resolvedFrom: raw } : { instrument };
  }

  private notFound(raw: string, ticker: string): SymbolNotFoundError {
    return new SymbolNotFoundError('Instrument not found', { id: raw, suggestions: this.index.suggest(ticker, 5).map(String) });
  }
}
