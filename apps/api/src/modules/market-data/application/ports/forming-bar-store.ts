import type { Bar } from '../../domain/bar';

export interface FormingBarStore {
  get(instrumentId: string): Promise<{ bar: Bar; lastCumVolume: number | null; seq: number | null } | null>;
  set(instrumentId: string, v: { bar: Bar; lastCumVolume: number | null; seq: number | null }): Promise<void>;
  clear(instrumentId: string): Promise<void>;
}
