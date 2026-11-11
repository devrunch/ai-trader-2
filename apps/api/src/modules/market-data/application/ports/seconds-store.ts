import type { Bar } from '../../domain/bar';
import type { SecondInterval } from '../../domain/interval';

/** The bounded, ephemeral ring of second bars per instrument and interval. Never a durable store. */
export interface SecondsStore {
  put(instrumentId: string, interval: SecondInterval, kind: 'forming' | 'closed', bar: Bar): Promise<void>;
  /** The newest `limit` bars strictly before `before` (default: all), oldest first. */
  read(instrumentId: string, interval: SecondInterval, limit: number, before?: number): Promise<Bar[]>;
}

/** Which (instrument, interval) pairs someone is watching right now; seconds bars are built only for these. */
export interface SecondsDemand {
  active(): Promise<ReadonlyArray<{ instrumentId: string; interval: SecondInterval }>>;
}

/** Marks that this process's clients watch an instrument at a seconds interval. */
export interface SecondsLeases {
  add(instrumentId: string, interval: SecondInterval): Promise<void>;
  remove(instrumentId: string, interval: SecondInterval): Promise<void>;
}
