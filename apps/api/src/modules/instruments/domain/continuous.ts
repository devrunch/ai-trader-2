import type { InstrumentId } from './instrument-id.js';
import type { Instrument } from './instrument.js';

export function parseContinuous(id: InstrumentId): { root: string; rank: number } | null {
  const match = /^(.+?)([1-9])!$/.exec(id.ticker);
  const root = match?.[1];
  const rank = match?.[2];
  return root && rank ? { root, rank: Number(rank) } : null;
}

export function resolveContinuous(
  root: string, rank: number, contracts: readonly Instrument[], today: string,
): Instrument | null {
  const candidates = contracts.filter(instrument => instrument.type === 'futures'
    && (instrument.underlying ? instrument.underlying.ticker === root : instrument.ticker.startsWith(root))
    && instrument.expiry !== undefined && instrument.expiry >= today);
  candidates.sort((a, b) => (a.expiry ?? '').localeCompare(b.expiry ?? ''));
  return candidates[rank - 1] ?? null;
}
