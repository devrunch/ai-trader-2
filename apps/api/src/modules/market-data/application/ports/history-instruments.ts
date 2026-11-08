interface HistoryMapping {
  providerSymbol: string;
  providerToken?: string;
  volumeType: 'real' | 'tick' | 'none';
}
export interface HistoryInstruments {
  getMapping(id: string, provider: 'kite' | 'deriv' | 'us-delayed', signal: AbortSignal): Promise<HistoryMapping | undefined>;
  held(signal: AbortSignal): Promise<string[]>;
}
