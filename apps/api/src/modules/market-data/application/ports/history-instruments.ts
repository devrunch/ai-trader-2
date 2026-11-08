interface HistoryMapping {
  providerSymbol: string;
  providerToken?: string;
  volumeType: 'real' | 'tick' | 'none';
}
export interface HistoryInstruments {
  getMapping(id: string, provider: 'kite', signal: AbortSignal): Promise<HistoryMapping | undefined>;
  held(signal: AbortSignal): Promise<string[]>;
}
