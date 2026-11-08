import { describe, expect, it } from 'vitest';
import {
  diffMasters, InstrumentId, type Instrument, type InstrumentChange,
  type InstrumentChangeKind, type InstrumentStatus, type InstrumentType,
} from './index.js';

const stock: InstrumentType = 'stock';
const active: InstrumentStatus = 'active';

function instrument(ticker: string, fields: Partial<Instrument> = {}): Instrument {
  return {
    id: InstrumentId.parse(`NSE:${ticker}`), exchange: 'NSE', ticker,
    description: ticker, type: stock, currency: 'INR', timezone: 'Asia/Kolkata',
    session: '0915-1530', pricescale: 100, minmov: 5, lotSize: 1,
    hasIntraday: true, volumeType: 'real', status: active, aliases: [], ...fields,
  };
}

const at = '2026-11-08T07:00:00.000Z';

describe('FR-SY-2, FR-SY-4, E23 instrument master changes', () => {
  it('same ISIN on another exchange is not a rename', () => {
    const nse = instrument('RELIANCE', { isin: 'INE002A01018' });
    const bse = instrument('RELIANCE', {
      id: InstrumentId.parse('BSE:RELIANCE'), exchange: 'BSE', isin: 'INE002A01018',
    });
    expect(diffMasters([nse, bse], [nse], at)).toEqual([
      { kind: 'delisted', id: bse.id, at },
    ]);
  });

  it('an existing instrument is never a rename successor', () => {
    const a = instrument('A', { isin: 'X' });
    const b = instrument('B', { isin: 'Y' });
    const next = [{ ...b, isin: 'X' }];
    const expected: InstrumentChange[] = [
      { kind: 'delisted', id: a.id, at },
      { kind: 'updated', id: b.id, at },
    ];
    expect(diffMasters([a, b], next, at)).toEqual(expected);
    expect(diffMasters([a, b], next, at, i => i.isin)).toEqual(expected);
  });

  it('diff detects listed, delisted, expired, renamed by ISIN, updated', () => {
    const prev = [instrument('OLD', { isin: 'ISIN' }), instrument('DELIST'), instrument('EXPIRE', { expiry: '2026-11-07' }), instrument('UPDATE')];
    const next = [instrument('NEW', { isin: 'ISIN' }), instrument('LIST'), instrument('UPDATE', { lotSize: 2 })];
    const expected: InstrumentChange[] = [
      { kind: 'renamed', id: InstrumentId.parse('NSE:OLD'), successor: InstrumentId.parse('NSE:NEW'), at },
      { kind: 'delisted', id: InstrumentId.parse('NSE:DELIST'), at },
      { kind: 'expired', id: InstrumentId.parse('NSE:EXPIRE'), at },
      { kind: 'listed', id: InstrumentId.parse('NSE:LIST'), at },
      { kind: 'updated', id: InstrumentId.parse('NSE:UPDATE'), at },
    ];
    const kinds: InstrumentChangeKind[] = ['renamed', 'delisted', 'expired', 'listed', 'updated'];
    expect(diffMasters(prev, next, at)).toEqual(expected);
    expect(expected.map(change => change.kind)).toEqual(kinds);
  });

  it('a rename does not also report listed or delisted', () => {
    const old = instrument('OLD', { isin: 'ISIN', expiry: '2026-01-01' });
    const successor = instrument('NEW', { isin: 'ISIN' });
    expect(diffMasters([old], [successor], at)).toEqual([{ kind: 'renamed', id: old.id, successor: successor.id, at }]);
  });

  it('diff is deterministic', () => {
    const prev = ['Z', 'A', 'M'].map(ticker => instrument(ticker));
    const next = ['Y', 'B'].map(ticker => instrument(ticker));
    const changes = diffMasters(prev, next, at);
    expect(diffMasters([...prev].reverse(), [...next].reverse(), at)).toEqual(changes);
    expect(changes.map(change => change.id.ticker)).toEqual(['A', 'M', 'Z', 'B', 'Y']);
  });

  it('custom identity function detects renames by vendor token', () => {
    const old = instrument('OLD');
    const successor = instrument('NEW');
    expect(diffMasters([old], [successor], at, i => i.aliases[0])).toEqual([
      { kind: 'delisted', id: old.id, at }, { kind: 'listed', id: successor.id, at },
    ]);
    old.aliases = ['token-42'];
    successor.aliases = ['token-42'];
    expect(diffMasters([old], [successor], at, i => i.aliases[0])).toEqual([{ kind: 'renamed', id: old.id, successor: successor.id, at }]);
  });

  it('compares fields deeply while ignoring id object identity', () => {
    const old = instrument('SAME', { underlying: InstrumentId.parse('NSE:ROOT'), aliases: ['a', 'b'] });
    const same = instrument('SAME', { underlying: InstrumentId.parse('NSE:ROOT'), aliases: ['a', 'b'] });
    expect(diffMasters([old], [same], at)).toEqual([]);
    for (const fields of [{ aliases: ['b', 'a'] }, { underlying: InstrumentId.parse('BSE:ROOT') }, { sector: 'metal' }]) {
      expect(diffMasters([old], [{ ...same, ...fields }], at)).toEqual([{ kind: 'updated', id: old.id, at }]);
    }
    const expiresToday = instrument('TODAY', { expiry: '2026-11-08' });
    expect(diffMasters([expiresToday], [], at)).toEqual([{ kind: 'delisted', id: expiresToday.id, at }]);
  });
});
