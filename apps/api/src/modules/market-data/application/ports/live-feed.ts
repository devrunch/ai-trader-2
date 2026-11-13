import type { DepthLevel } from '@aitrader/contracts';
/** Order book carried by a tick: 5 levels each side from Kite full mode, top of book from Deriv. */
interface TickBook { levels: '5' | '1'; bids: DepthLevel[]; asks: DepthLevel[] }
export interface Tick { instrumentId: string; at: number; price: number; cumVolume: number | null; seq?: number; prevClose?: number; book?: TickBook }
export type FeedState = 'connecting' | 'live' | 'reconnecting' | 'stale' | 'stopped';
export interface LiveFeed {
  readonly name: 'kite' | 'deriv' | 'us-delayed';
  readonly delayMs?: number;
  subscribe(instrumentIds: readonly string[]): Promise<void>;
  unsubscribe(instrumentIds: readonly string[]): Promise<void>;
  onTick(listener: (t: Tick) => void): () => void;
  onState(listener: (s: FeedState, reason?: string, detail?: string) => void): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
