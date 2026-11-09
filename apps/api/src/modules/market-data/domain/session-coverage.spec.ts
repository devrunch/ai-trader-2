import { describe, expect, it } from 'vitest';
import { sessionCoverage } from './session-coverage';

const ist = (hhmm: string) => Date.parse(`2026-11-09T${hhmm}:00+05:30`);
const session = { open: ist('09:15'), close: ist('15:30') };
const minutes = (from: string, to: string) => {
  const out: number[] = [];
  for (let t = ist(from); t < ist(to); t += 60_000) out.push(t);
  return out;
};

describe('sessionCoverage (E7, FR-MD-5)', () => {
  it('a full session has nothing missing', () => {
    expect(sessionCoverage(session, minutes('09:15', '15:30'))).toEqual({ expected: 375, stored: 375, gaps: [], endsAt: ist('15:30') });
  });

  it('reports head and interior gaps as ranges', () => {
    const stored = [...minutes('09:20', '10:00'), ...minutes('10:05', '15:30')];
    expect(sessionCoverage(session, stored).gaps).toEqual([{ from: ist('09:15'), to: ist('09:20') }, { from: ist('10:00'), to: ist('10:05') }]);
  });

  it('data ending early is reported by its end, not as a gap (closing auction or outage)', () => {
    const result = sessionCoverage(session, minutes('09:15', '15:15'));
    expect(result.gaps).toEqual([]);
    expect(result.endsAt).toBe(ist('15:15'));
  });

  it('ignores bars outside the session', () => {
    expect(sessionCoverage(session, [ist('09:00'), ...minutes('09:15', '15:30'), ist('15:45')]).stored).toBe(375);
  });

  it('no stored bars means no end and nothing to compare', () => {
    expect(sessionCoverage(session, [])).toEqual({ expected: 375, stored: 0, gaps: [], endsAt: null });
  });
});
