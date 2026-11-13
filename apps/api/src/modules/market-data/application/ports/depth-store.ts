import type { Depth } from '@aitrader/contracts';

/** The latest order book per instrument; entries expire quickly so a dead feed or closed market reads as absent. */
export interface DepthStore {
  get(instrumentId: string, signal?: AbortSignal): Promise<Depth | null>;
  set(instrumentId: string, depth: Depth, signal?: AbortSignal): Promise<void>;
}
