import type { InstrumentRepository, OptionContractRow } from './ports/instrument-repository';

/** The listed option contracts of an NSE underlying and the vendor symbol of its spot price, for the options module. */
export class OptionContractList {
  constructor(private readonly repository: InstrumentRepository) {}

  /** Null when the underlying is unknown or has no active option contracts. */
  async list(ticker: string, from: string, signal?: AbortSignal): Promise<{ spotSymbol: string; contracts: OptionContractRow[] } | null> {
    const id = `NSE:${ticker}`;
    const [contracts, mapping] = await Promise.all([this.repository.listOptionContracts(id, from, signal), this.repository.getMapping(id, 'kite', signal)]);
    return contracts.length > 0 && mapping ? { spotSymbol: mapping.providerSymbol, contracts } : null;
  }
}
