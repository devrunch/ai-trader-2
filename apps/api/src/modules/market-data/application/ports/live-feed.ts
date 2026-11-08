export interface Tick { instrumentId: string; at: number; price: number; cumVolume: number | null; seq?: number }
export type FeedState = 'connecting' | 'live' | 'reconnecting' | 'stale' | 'stopped';
export interface LiveFeed {
  readonly name: 'kite' | 'deriv' | 'us-delayed';
  readonly delayMs?: number;
  subscribe(instrumentIds: readonly string[]): Promise<void>;
  unsubscribe(instrumentIds: readonly string[]): Promise<void>;
  onTick(listener: (t: Tick) => void): () => void;
  onState(listener: (s: FeedState, reason?: string) => void): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
