import { describe, expect, it } from 'vitest';
import type { InstrumentCoverage } from '../../market-data/application/index';
import { buildDataReport } from './data-report';

const ist = (hhmm: string) => Date.parse(`2026-11-09T${hhmm}:00+05:30`);
const nse = { open: ist('09:15'), close: ist('15:30') };
const row = (instrumentId: string, endsAt: string, gaps: Array<[string, string]> = [], repairedGaps = 0): InstrumentCoverage => ({
  instrumentId, calendarId: 'NSE', session: nse, repairedGaps,
  coverage: { expected: 375, stored: 300, endsAt: ist(endsAt), gaps: gaps.map(([from, to]) => ({ from: ist(from), to: ist(to) })) },
});

describe('buildDataReport', () => {
  it('all complete', () => {
    const report = buildDataReport('2026-11-09', [row('NSE:NIFTY', '15:30')]);
    expect(report.subject).toBe('Data report 2026-11-09: all complete');
    expect(report.issues).toBe(0);
  });

  it('groups early endings into calendar drift and lists remaining gaps', () => {
    const report = buildDataReport('2026-11-09', [
      row('NSE:RELIANCE', '15:15'), row('NSE:TCS', '15:15'), row('NSE:NIFTY', '15:30', [['10:00', '10:05']], 2),
    ]);
    expect(report.subject).toBe('Data report 2026-11-09: 2 issues');
    expect(report.text).toContain('2 NSE instruments end at 15:15 IST; the NSE calendar closes at 15:30 (NSE:RELIANCE, NSE:TCS)');
    expect(report.text).toContain('NSE:NIFTY: 10:00–10:05 IST (5 min)');
    expect(report.text).toContain('Repaired gaps: 2');
  });
});
