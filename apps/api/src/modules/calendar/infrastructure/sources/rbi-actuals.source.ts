import type { SourceClient, SourceDescriptor } from '../../../../shared/sources';
import type { ActualObservation, ActualsSource, EventRef } from '../../application/ports/actuals-source';

export const RBI_ACTUALS_DESCRIPTOR: SourceDescriptor = {
  id: 'rbi-actuals', owner: 'calendar', kind: 'policy rate decision', markets: ['india'], envKeys: [], rateLimit: { requests: 30, windowSec: 3600 }, schedule: 'event-actuals (every 3 minutes near an RBI decision)',
  terms: 'RBI public Monetary Policy page and the MPC resolution press release; read only within 90 minutes of a scheduled decision, at most one check every 3 minutes (two pages).',
  docs: 'https://www.rbi.org.in/scripts/annualpolicy.aspx',
};

const POLICY_PAGE = 'https://www.rbi.org.in/scripts/annualpolicy.aspx';
const TITLE = 'RBI Monetary Policy Decision';
const MIN_GAP_MS = 3 * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** "Oct 07, 2026": how the Monetary Policy page dates a release, in India time. */
export function rbiDateLabel(atMs: number): string {
  const d = new Date(atMs + IST_OFFSET_MS);
  return `${MONTHS[d.getUTCMonth()] ?? ''} ${String(d.getUTCDate()).padStart(2, '0')}, ${String(d.getUTCFullYear())}`;
}

/** The link of "Resolution of the Monetary Policy Committee" under the date heading, or null when that day has none yet. */
export function findResolutionLink(policyPage: string, label: string): string | null {
  const heading = `<td class="tableheader"><b>${label}</b></td>`;
  const start = policyPage.indexOf(heading);
  if (start < 0) return null;
  const next = policyPage.indexOf('<td class="tableheader"><b>', start + heading.length);
  const section = policyPage.slice(start, next < 0 ? undefined : policyPage.indexOf('<td class="tableheader"><b>', next + 1));
  const block = /Resolution of the Monetary Policy Committee[\s\S]*?href="([^"]*BS_PressReleaseDisplay\.aspx\?prid=\d+)"/i.exec(section);
  return block?.[1] ?? null;
}

/** The policy repo rate the resolution states ("...by 25 bps to 5.50 per cent", "...unchanged at 5.25 per cent"), or null. */
export function parseRepoRate(resolutionPage: string): string | null {
  const text = resolutionPage.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const match = /policy repo rate[^.]*?\b(\d+(?:\.\d+)?)\s+per cent/i.exec(text);
  return match?.[1] ? `${Number(match[1]).toFixed(2)}%` : null;
}

/** The repo-rate decision on the day, from the MPC resolution. Reads the Monetary Policy page, and the resolution only once it is linked there. */
export class RbiActuals implements ActualsSource {
  private lastCheck = 0;
  constructor(private readonly client: SourceClient, private readonly now: () => number = Date.now) {}

  async fetch(events: EventRef[], signal: AbortSignal): Promise<ActualObservation[]> {
    const event = events.find(e => e.title === TITLE && e.country === 'INR');
    if (!event || this.now() - this.lastCheck < MIN_GAP_MS) return [];
    this.lastCheck = this.now();
    const index = await this.client.get(RBI_ACTUALS_DESCRIPTOR.id, POLICY_PAGE, { signal });
    const link = findResolutionLink(index.text, rbiDateLabel(Date.parse(event.at)));
    if (!link) return [];
    const resolution = await this.client.get(RBI_ACTUALS_DESCRIPTOR.id, link, { signal });
    const rate = parseRepoRate(resolution.text);
    if (rate === null) throw new Error('rbi-actuals: the resolution is linked but the repo rate was not found (the page changed shape)');
    await this.client.recordItems(RBI_ACTUALS_DESCRIPTOR.id, 1);
    return [{ eventId: event.id, actual: rate, source: RBI_ACTUALS_DESCRIPTOR.id }];
  }
}
