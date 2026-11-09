/** The exchange's official previous close (Kite ohlc.close), saved per instrument for the trading date it applies to. */
export interface PreviousCloseStore {
  get(instrumentId: string, signal?: AbortSignal): Promise<{ close: number; forDate: string } | null>;
  set(instrumentId: string, close: number, forDate: string, signal?: AbortSignal): Promise<void>;
}

/** On-demand official previous close for instruments not streaming (Kite /quote/ohlc, Yahoo). */
export interface PreviousCloseSource {
  fetch(instrumentId: string, signal: AbortSignal): Promise<number | null>;
}
