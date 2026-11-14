import type { Fundamentals } from '@aitrader/contracts';

/** What a source reads off a company page; the service adds identity, provenance and the fetch time. */
export type FundamentalsFigures = Pick<Fundamentals, 'name' | 'reportDate' | 'ratios' | 'quarterly' | 'annual' | 'shareholding'>;
/** What a source reads off a company page; `nextResultsDate` (YYYY-MM-DD) is the announced results or board-meeting date, null when the page shows none. */
export type SourceFigures = FundamentalsFigures & { nextResultsDate?: string | null };

export interface FundamentalsSource {
  readonly id: string;
  /** Throws FundamentalsNotFoundError for an unknown ticker and FundamentalsParseError when nothing could be read. `ticker` is the bare NSE ticker. */
  fetch(ticker: string, consolidated: boolean, signal?: AbortSignal): Promise<SourceFigures>;
}
