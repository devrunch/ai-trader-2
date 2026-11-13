import type { FundamentalField, ScanResult, UniverseId, UniverseInfo } from '@aitrader/contracts';
import type { Bar } from '../../domain/derived-series';

// Bar is re-used below.
export interface UniversePort {
  list(): Promise<UniverseInfo[]>;
  members(id: UniverseId, userId: string): Promise<Array<{ symbol: string; name: string | null }>>;
}
export interface StoredBars { bars: Bar[]; newestTime: number | null; stale: string | null }
/** Stored bars only (closed bars, oldest first); never fetches from a vendor. */
export interface StoredBarsPort {
  latest(symbols: string[], interval: '15' | '60' | '1D', limit: number): Promise<Map<string, StoredBars>>;
}
interface OnBarsResult { times: number[]; plots: Array<{ id: string; values: Array<number | null> }> }
export interface IndicatorPort {
  computeOnBars(spec: { id: string; inputs: Record<string, number | boolean | string> }, bars: Bar[]): Promise<OnBarsResult> | OnBarsResult;
}
/** Cache only; symbols without data are absent from the map. */
export interface FundamentalsPort { getMany(symbols: string[]): Promise<Map<string, Partial<Record<FundamentalField, number | null>>>> }
export interface ResultCache {
  get(key: string): Promise<ScanResult | null>;
  set(key: string, result: ScanResult, ttlSeconds: number): Promise<void>;
}
