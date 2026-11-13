import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SourceClient, SourceRegistry, type SourceHealth } from '../../../../shared/sources';
import { IndiaScheduleSource, MOSPI_DESCRIPTOR } from '../india-schedule.source';
import { MospiCalendar, parseAdvanceReleaseCalendar } from './mospi.source';

const fixture = (name: string): string => readFileSync(join(__dirname, '__fixtures__', 'mospi', name), 'utf8');
const arcText = fixture('arc-2026-27-updated-october.txt');
const urlOf = (input: string | URL | Request): string => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const signal = new AbortController().signal;
const at = (title: string, day: string): [string, string] => [title, `${day}T16:00:00+05:30`];

describe('MoSPI Advance Release Calendar parse', () => {
  const releases = parseAdvanceReleaseCalendar(arcText);
  const rows = releases.map(r => [r.title, r.at.slice(0, 10), r.impact]);

  it('finds the CPI, IIP and GDP rows of the recorded 2026-27 calendar with the year from the financial year', () => {
    expect(rows.filter(r => r[1]?.startsWith('2026-1'))).toEqual([
      ['India CPI y/y', '2026-10-12', 'High'], ['India IIP y/y', '2026-10-28', 'Medium'], ['India CPI y/y', '2026-11-12', 'High'],
      ['India IIP y/y', '2026-11-30', 'Medium'], ['India GDP q/q', '2026-11-30', 'High'], ['India CPI y/y', '2026-12-14', 'High'], ['India IIP y/y', '2026-12-28', 'Medium'],
    ]);
    expect(rows.filter(r => r[1]?.startsWith('2027')).map(r => [r[0], r[1]])).toEqual(expect.arrayContaining([
      ['India CPI y/y', '2027-01-12'], ['India IIP y/y', '2027-01-28'], ['India CPI y/y', '2027-02-12'], ['India GDP q/q', '2027-02-26'], ['India CPI y/y', '2027-03-12'],
    ]));
    expect(releases).toHaveLength(28);
  });

  it('moves a release due on a weekend to the next working day, as MoSPI did for 2026-06-28 and 2026-04-12', () => {
    expect(releases.map(r => r.at.slice(0, 10))).toContain('2026-06-29');
    expect(releases.map(r => r.at.slice(0, 10))).toContain('2026-04-13');
    expect(releases.every(r => ![0, 6].includes(new Date(`${r.at.slice(0, 10)}T00:00:00Z`).getUTCDay()))).toBe(true);
  });

  it('keeps every release at 16:00 India time', () => { expect(releases.every(r => r.at.endsWith('T16:00:00+05:30'))).toBe(true); });

  it('returns nothing for a document that is not the calendar', () => { expect(parseAdvanceReleaseCalendar('Press release of something else')).toEqual([]); });
});

/** A one-page PDF with the given text, built by hand so the default PDF reader is exercised without a binary fixture. */
function tinyPdf(text: string): Uint8Array<ArrayBuffer> {
  const content = `BT /F1 10 Tf 10 50 Td (${text.replace(/[()]/g, c => `\\${c}`)}) Tj ET`;
  const objects = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 2400 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${String(content.length)}>>\nstream\n${content}\nendstream`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  return new TextEncoder().encode(`%PDF-1.4\n${objects.map((o, i) => `${String(i + 1)} 0 obj\n${o}\nendobj\n`).join('')}trailer\n<</Root 1 0 R/Size 6>>\n%%EOF`);
}

function setup(pointer: string, pdfText: () => Promise<string>, pdf: Uint8Array<ArrayBuffer> = new Uint8Array([37, 80, 68, 70])) {
  const registry = new SourceRegistry({});
  registry.register(MOSPI_DESCRIPTOR);
  const health = { success: vi.fn(() => Promise.resolve()), items: vi.fn(() => Promise.resolve()), failure: vi.fn(() => Promise.resolve()),
    rateLimited: vi.fn(() => Promise.resolve()), read: vi.fn(() => Promise.resolve({})) } satisfies SourceHealth;
  const fetchFn = vi.fn<typeof fetch>(input => Promise.resolve(urlOf(input).endsWith('get-latest-release-calender') ? new Response(pointer) : new Response(pdf)));
  const client = new SourceClient(registry, health, () => ({ take: () => Promise.resolve() }), { fetch: fetchFn, sleep: () => Promise.resolve() });
  const readPdf = vi.fn(pdfText);
  return { calendar: new MospiCalendar(client, readPdf), real: new MospiCalendar(client), client, health, fetchFn, readPdf };
}

describe('MoSPI calendar discovery', () => {
  const pointer = fixture('latest-release-calendar.json');

  it('follows the latest-calendar pointer to the PDF (spaces encoded) and reads it once per new file', async () => {
    const { calendar, fetchFn, readPdf } = setup(pointer, () => Promise.resolve(arcText));
    expect((await calendar.discover(signal)).length).toBe(28);
    expect(urlOf(fetchFn.mock.calls[1]?.[0] ?? '')).toBe('https://www.mospi.gov.in/uploads/documents/releaseCalender/1793948871564-ARC%202026-27%20updated%20till%20October%202026.pdf');
    await calendar.discover(signal);
    expect(readPdf).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('reads a real PDF with the default reader', async () => {
    const { real } = setup(pointer, () => Promise.resolve(''), tinyPdf('ADVANCE RELEASE CALENDAR (2026-27) 12th Nov All India Consumer Price Index (CPI) 28th Nov All India Index of Industrial Production (IIP)'));
    expect((await real.discover(signal)).map(r => [r.title, r.at])).toEqual([['India CPI y/y', '2026-11-12T16:00:00+05:30'], ['India IIP y/y', '2026-11-30T16:00:00+05:30']]);
  });

  it('flags a changed document: no CPI, IIP or GDP rows is a failure in the source health', async () => {
    const { calendar, health } = setup(pointer, () => Promise.resolve('a different document'));
    await expect(calendar.discover(signal)).rejects.toThrow('changed shape');
    expect(health.failure).toHaveBeenCalledWith('mospi', expect.stringContaining('zero items'));
  });

  it('fails on a pointer without a document link', async () => {
    const { calendar } = setup('{"status":"success","data":null}', () => Promise.resolve(arcText));
    await expect(calendar.discover(signal)).rejects.toThrow();
  });
});

describe('India schedule with discovery', () => {
  const now = Date.parse('2026-11-11T06:00:00Z');
  const discovery = (list: Array<[string, string]>) => ({ discover: () => Promise.resolve(list.map(([title, iso]) => ({ title, at: iso, impact: 'High' as const }))) });

  it('prefers the discovered dates, keeps vendored releases of months discovery does not cover, and reports the discovered count', async () => {
    const recordItems = vi.fn(() => Promise.resolve());
    const client = { recordItems } as unknown as SourceClient;
    // Discovery moves November CPI and GDP, adds December CPI, and says nothing of 2027: those vendored dates stay.
    const source = new IndiaScheduleSource(() => now, 1, 90, client, discovery([at('India CPI y/y', '2026-11-13'), at('India GDP q/q', '2026-11-27'), at('India CPI y/y', '2026-12-14')]));
    const events = await source.fetch(signal);
    expect(events.map(e => [e.title, e.at])).toEqual([
      ['India CPI y/y', '2026-11-13T10:30:00.000Z'], ['India GDP q/q', '2026-11-27T10:30:00.000Z'], ['RBI Monetary Policy Decision', '2026-12-04T04:30:00.000Z'],
      ['India CPI y/y', '2026-12-14T10:30:00.000Z'], ['India IIP y/y', '2026-12-28T10:30:00.000Z'], ['India CPI y/y', '2027-01-12T10:30:00.000Z'],
      ['India IIP y/y', '2027-01-28T10:30:00.000Z'], ['RBI Monetary Policy Decision', '2027-02-05T04:30:00.000Z'],
    ]);
    expect(recordItems).toHaveBeenCalledWith('mospi', 3);
  });

  it('falls back to the vendored dates when discovery throws, without reporting the vendored count as discovered', async () => {
    const recordItems = vi.fn(() => Promise.resolve());
    const client = { recordItems } as unknown as SourceClient;
    const source = new IndiaScheduleSource(() => now, 1, 20, client, { discover: () => Promise.reject(new Error('HTTP 503')) });
    expect((await source.fetch(signal)).map(e => e.title)).toEqual(['India CPI y/y', 'India GDP q/q']);
    expect(recordItems).not.toHaveBeenCalledWith('mospi', expect.anything());
  });
});
