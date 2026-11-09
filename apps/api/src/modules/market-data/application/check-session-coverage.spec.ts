import { describe, expect, it, vi } from 'vitest';
import type { Bar } from '../domain/bar';
import { CheckSessionCoverage } from './check-session-coverage';

const ist = (hhmm: string, day = '2026-11-09') => Date.parse(`${day}T${hhmm}:00+05:30`);
const bar = (time: number): Bar => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 });
const minutes = (from: number, to: number) => { const out: Bar[] = []; for (let t = from; t < to; t += 60_000) out.push(bar(t)); return out; };

function store(rows: Record<string, Bar[]>) {
  return {
    instrumentsWith1m: vi.fn(() => Promise.resolve(Object.keys(rows))),
    range1m: vi.fn((id: string, from: number, to: number) => Promise.resolve((rows[id] ?? []).filter(b => b.time >= from && b.time < to))),
  };
}

describe('CheckSessionCoverage (E7, FR-MD-5)', () => {
  it('repairs interior gaps through history fill and reports what remains', async () => {
    const rows = { 'NSE:NIFTY': [...minutes(ist('09:15'), ist('10:00')), ...minutes(ist('10:10'), ist('15:30'))] };
    const s = store(rows);
    const fill = { execute: vi.fn(() => { rows['NSE:NIFTY'].push(...minutes(ist('10:00'), ist('10:10'))); return Promise.resolve({ ok: true as const, data: { written: 10, repaired: 0 } }); }) };
    const [nifty] = await new CheckSessionCoverage(s, fill).execute('2026-11-09');
    expect(fill.execute).toHaveBeenCalledWith('NSE:NIFTY', '1m', ist('10:00'), ist('10:10'), expect.any(AbortSignal));
    expect(nifty).toMatchObject({ instrumentId: 'NSE:NIFTY', calendarId: 'NSE', repairedGaps: 1, coverage: { gaps: [], stored: 375, endsAt: ist('15:30') } });
  });

  it('uses each instrument’s own session (futures to 15:40)', async () => {
    const s = store({ 'NSE:NIFTYX2026': minutes(ist('09:15'), ist('15:40')) });
    const [fut] = await new CheckSessionCoverage(s).execute('2026-11-09');
    expect(fut).toMatchObject({ calendarId: 'NFO', session: { close: ist('15:40') }, coverage: { expected: 385, stored: 385 } });
  });

  it('skips instruments with no session that day', async () => {
    const s = store({ 'NSE:RELIANCE': minutes(ist('09:15'), ist('15:15')) });
    expect(await new CheckSessionCoverage(s).execute('2026-11-10')).toEqual([]); // Diwali Balipratipada holiday
  });
});
