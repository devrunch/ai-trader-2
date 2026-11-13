import { Logger } from '@nestjs/common';
import { z } from 'zod';
import type { SourceClient } from '../../../../shared/sources';
import type { ScheduleDiscovery } from '../../application/ports/schedule-discovery';
import type { ScheduledRelease } from '../../domain/india-schedule';
import { MOSPI_DESCRIPTOR } from '../india-schedule.source';

const logger = new Logger('MospiCalendar');
const LATEST = 'https://www.mospi.gov.in/api/documents/get-latest-release-calender';
const SITE = 'https://www.mospi.gov.in/';
const Latest = z.object({ data: z.object({ url: z.string().min(1) }) });
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY = 86_400_000;

type Kind = Pick<ScheduledRelease, 'title' | 'impact'>;
/** Row titles in the Advance Release Calendar that become calendar events; the rest (PLFS, ISP, flash reports...) are not market movers. */
const KINDS: ReadonlyArray<readonly [RegExp, Kind]> = [
  [/All India Consumer Price Index/i, { title: 'India CPI y/y', impact: 'High' }],
  [/All India Index of Industrial Production/i, { title: 'India IIP y/y', impact: 'Medium' }],
  [/Quarterly Estimates of GDP/i, { title: 'India GDP q/q', impact: 'High' }],
];
const ROW_START = /(?<!on )(\d{1,2})(?:st|nd|rd|th)\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/g;

/** A release due on a weekend comes out on the next working day (the calendar says so, and 2026-04-12 and 2026-06-28 were released on the Monday). */
function nextWorkingDay(utcMidnight: number): number {
  const day = new Date(utcMidnight).getUTCDay();
  return utcMidnight + (day === 6 ? 2 : day === 0 ? 1 : 0) * DAY;
}

/**
 * Reads the text of the Advance Release Calendar PDF. Rows look like "12th Nov All India Consumer Price Index (CPI)"; the month sometimes sits on its own line
 * and "Released on 13th April, 2026" follows past rows. The financial year in the heading gives the year (April to December, then January to March).
 */
export function parseAdvanceReleaseCalendar(text: string): ScheduledRelease[] {
  const flat = text.replace(/\s+/g, ' ');
  const fiscal = /ADVANCE RELEASE CALENDAR \((\d{4})-\d{2}\)/i.exec(flat)?.[1];
  if (!fiscal) return [];
  const starts = [...flat.matchAll(ROW_START)];
  const found = new Map<string, ScheduledRelease>();
  starts.forEach((row, i) => {
    const month = MONTHS.indexOf((row[2] ?? '').toLowerCase());
    const body = flat.slice((row.index) + row[0].length, starts[i + 1]?.index);
    const kind = KINDS.find(([pattern]) => pattern.test(body))?.[1];
    if (!kind || month < 0) return;
    const year = Number(fiscal) + (month < 3 ? 1 : 0);
    const date = new Date(nextWorkingDay(Date.UTC(year, month, Number(row[1]))));
    const day = date.toISOString().slice(0, 10);
    found.set(`${kind.title}|${day}`, { ...kind, at: `${day}T16:00:00+05:30` });
  });
  return [...found.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Pulls the extracted text of a PDF; pdfjs is loaded only when a calendar actually has to be read. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const { text } = await extractText(await getDocumentProxy(bytes), { mergePages: true });
  return text;
}

/**
 * Finds MoSPI's current Advance Release Calendar: the site's own "latest release calendar" pointer names the PDF, which is read once per new file
 * (the pointer is checked each time, the PDF only when its link changes).
 */
export class MospiCalendar implements ScheduleDiscovery {
  private cached: { url: string; releases: ScheduledRelease[] } | null = null;

  constructor(private readonly client: SourceClient, private readonly readPdf: (bytes: Uint8Array) => Promise<string> = pdfText) {}

  async discover(signal: AbortSignal): Promise<ScheduledRelease[]> {
    const pointer = Latest.parse(JSON.parse((await this.client.get(MOSPI_DESCRIPTOR.id, LATEST, { headers: { accept: 'application/json' }, signal })).text));
    const url = new URL(pointer.data.url, SITE).href;
    if (this.cached?.url === url) return this.cached.releases;
    const pdf = await this.client.get(MOSPI_DESCRIPTOR.id, url, { binary: true, maxBytes: 8_000_000, timeoutMs: 30_000, signal });
    const releases = parseAdvanceReleaseCalendar(await this.readPdf(pdf.bytes ?? new Uint8Array()));
    if (releases.length === 0) {
      await this.client.recordItems(MOSPI_DESCRIPTOR.id, 0);
      throw new Error('mospi: the Advance Release Calendar has no CPI, IIP or GDP rows (the document changed shape)');
    }
    logger.log({ message: 'MoSPI release calendar read', url, releases: releases.length });
    this.cached = { url, releases };
    return releases;
  }
}
