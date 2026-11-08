import type { InstrumentId } from './instrument-id.js';
import type { Instrument } from './instrument.js';

export type InstrumentChangeKind = 'listed' | 'renamed' | 'delisted' | 'expired' | 'updated';
export interface InstrumentChange {
  kind: InstrumentChangeKind;
  id: InstrumentId;
  successor?: InstrumentId;
  at: string;
}

const kindOrder: Record<InstrumentChangeKind, number> = {
  renamed: 0, delisted: 1, expired: 2, listed: 3, updated: 4,
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftEntries: [string, unknown][] = Object.entries(left);
  const rightEntries = new Map<string, unknown>(Object.entries(right));
  return leftEntries.length === rightEntries.size
    && leftEntries.every(([key, value]) => rightEntries.has(key) && deepEqual(value, rightEntries.get(key)));
}

function fields(instrument: Instrument): [string, unknown][] {
  return Object.entries(instrument).filter(([key]) => key !== 'id');
}

// Keep both passes together: rename successors must be known before emitting listings.
export function diffMasters(
  prev: readonly Instrument[], next: readonly Instrument[], at: string,
  identity: (i: Instrument) => string | undefined = i => i.isin === undefined ? undefined : `${i.exchange}|${i.isin}`,
): InstrumentChange[] {
  const previousIds = new Set(prev.map(i => i.id.toString()));
  const nextById = new Map(next.map(i => [i.id.toString(), i]));
  const nextByIdentity = new Map<string, Instrument>();
  for (const instrument of [...next].sort((a, b) => compareStrings(b.id.toString(), a.id.toString()))) {
    if (previousIds.has(instrument.id.toString())) continue;
    const key = identity(instrument);
    if (key !== undefined) nextByIdentity.set(key, instrument);
  }
  const successors = new Set<string>();
  const changes: InstrumentChange[] = [];
  for (const instrument of prev) {
    const current = nextById.get(instrument.id.toString());
    if (current) {
      if (!deepEqual(Object.fromEntries(fields(instrument)), Object.fromEntries(fields(current)))) {
        changes.push({ kind: 'updated', id: instrument.id, at });
      }
      continue;
    }
    const key = identity(instrument);
    const successor = key === undefined ? undefined : nextByIdentity.get(key);
    if (successor) {
      changes.push({ kind: 'renamed', id: instrument.id, successor: successor.id, at });
      successors.add(successor.id.toString());
    } else {
      const kind = instrument.expiry !== undefined && instrument.expiry < at.slice(0, 10) ? 'expired' : 'delisted';
      changes.push({ kind, id: instrument.id, at });
    }
  }
  for (const instrument of next) {
    if (!previousIds.has(instrument.id.toString()) && !successors.has(instrument.id.toString())) {
      changes.push({ kind: 'listed', id: instrument.id, at });
    }
  }
  return changes.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || compareStrings(a.id.toString(), b.id.toString()));
}
