import { describe, expect, it } from 'vitest';
import { calendarFor } from './calendar';
import { tailGap } from './tail-gap';

// NSE 2026-11-09 (Monday): 09:15–15:30 IST = 03:45–10:00 UTC.
const ist = (hhmm: string, day = '2026-11-09') => Date.parse(`${day}T${hhmm}:00+05:30`);
const nse = calendarFor('NSE');

describe('tailGap (E7, E8, FR-MD-5)', () => {
  it('after the close, missing afternoon minutes are a gap up to the session close', () => {
    expect(tailGap(nse, ist('13:05'), ist('18:00'))).toEqual({ from: ist('13:06'), to: ist('15:30') });
  });

  it('a session complete to its last minute has no gap', () => {
    expect(tailGap(nse, ist('15:29'), ist('18:00'))).toBeNull();
  });

  it('during the session, normal live lag is not a gap (forming minute plus 2 minutes of slack)', () => {
    expect(tailGap(nse, ist('13:58'), ist('14:00') + 30_000)).toBeNull();
  });

  it('during the session, a longer outage is a gap up to the last closed minute', () => {
    expect(tailGap(nse, ist('13:30'), ist('14:00') + 30_000)).toEqual({ from: ist('13:31'), to: ist('14:00') });
  });

  it('over a weekend the last session is Friday, so a complete Friday has no gap', () => {
    expect(tailGap(nse, ist('15:29', '2026-11-06'), ist('12:00', '2026-11-08'))).toBeNull();
  });

  it('a whole missed session is a gap from the last stored minute', () => {
    expect(tailGap(nse, ist('15:29', '2026-11-06'), ist('18:00'))).toEqual({ from: ist('15:30', '2026-11-06'), to: ist('15:30') });
  });

  it('without stored bars there is no tail to repair (older history fill handles it)', () => {
    expect(tailGap(nse, undefined, ist('18:00'))).toBeNull();
  });
});
