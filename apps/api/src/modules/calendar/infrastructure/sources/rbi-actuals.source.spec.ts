import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SourceClient, SourceRegistry, type SourceHealth } from '../../../../shared/sources';
import type { EventRef } from '../../application/ports/actuals-source';
import { RBI_ACTUALS_DESCRIPTOR, RbiActuals, findResolutionLink, parseRepoRate, rbiDateLabel } from './rbi-actuals.source';

const fixture = (name: string): string => readFileSync(join(__dirname, '__fixtures__', 'rbi-actuals', name), 'utf8');
const urlOf = (input: string | URL | Request): string => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const signal = new AbortController().signal;
const decision: EventRef = { id: 'rbi', title: 'RBI Monetary Policy Decision', country: 'INR', at: '2026-10-07T04:30:00.000Z', forecast: '5.25%', previous: '5.25%' };

function setup(pages: Record<string, string>, clock: { t: number }) {
  const registry = new SourceRegistry({});
  registry.register(RBI_ACTUALS_DESCRIPTOR);
  const health = { success: vi.fn(() => Promise.resolve()), items: vi.fn(() => Promise.resolve()), failure: vi.fn(() => Promise.resolve()),
    rateLimited: vi.fn(() => Promise.resolve()), read: vi.fn(() => Promise.resolve({})) } satisfies SourceHealth;
  const fetchFn = vi.fn<typeof fetch>(input => Promise.resolve(new Response(pages[urlOf(input)] ?? 'missing', { status: pages[urlOf(input)] === undefined ? 404 : 200 })));
  const client = new SourceClient(registry, health, () => ({ take: () => Promise.resolve() }), { fetch: fetchFn, sleep: () => Promise.resolve() });
  return { source: new RbiActuals(client, () => clock.t), fetchFn, health };
}
const POLICY = 'https://www.rbi.org.in/scripts/annualpolicy.aspx';
const RESOLUTION = 'https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=63742';

describe('RBI actuals', () => {
  it('dates a decision in India time as the Monetary Policy page does', () => { expect(rbiDateLabel(Date.parse('2026-10-07T04:30:00Z'))).toBe('Oct 07, 2026'); });

  it('finds the resolution linked under the decision day, and nothing for a day without one', () => {
    const page = fixture('annualpolicy.html');
    expect(findResolutionLink(page, 'Oct 07, 2026')).toBe('https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=63742');
    expect(findResolutionLink(page, 'Aug 05, 2026')).toBe('https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=63287');
    expect(findResolutionLink(page, 'Dec 04, 2026')).toBeNull();
  });

  it('reads the repo rate from the recorded resolution and from the wording variants', () => {
    expect(parseRepoRate(fixture('resolution-2026-10-07.html'))).toBe('5.50%');
    expect(parseRepoRate('<p>the MPC voted to keep the policy repo rate under the liquidity adjustment facility (LAF) unchanged at 5.5 per cent.</p>')).toBe('5.50%');
    expect(parseRepoRate('<p>nothing about rates</p>')).toBeNull();
  });

  it('fetches the policy page then the resolution and returns the repo rate; skips other events', async () => {
    const clock = { t: Date.parse('2026-10-07T04:40:00Z') };
    const { source, fetchFn, health } = setup({ [POLICY]: fixture('annualpolicy.html'), [RESOLUTION]: fixture('resolution-2026-10-07.html') }, clock);
    expect(await source.fetch([{ ...decision, id: 'x', title: 'India CPI y/y' }], signal)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await source.fetch([decision], signal)).toEqual([{ eventId: 'rbi', actual: '5.50%', source: 'rbi-actuals' }]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(health.items).toHaveBeenCalledWith('rbi-actuals', 1);
  });

  it('checks at most once every three minutes and returns nothing while the resolution is not linked', async () => {
    const clock = { t: Date.parse('2026-12-04T04:31:00Z') };
    const { source, fetchFn } = setup({ [POLICY]: fixture('annualpolicy.html') }, clock);
    const dec = { ...decision, at: '2026-12-04T04:30:00.000Z' };
    expect(await source.fetch([dec], signal)).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    clock.t += 60_000;
    await source.fetch([dec], signal);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    clock.t += 3 * 60_000;
    await source.fetch([dec], signal);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('fails loudly when the resolution is linked but has no repo rate', async () => {
    const { source } = setup({ [POLICY]: fixture('annualpolicy.html'), [RESOLUTION]: '<p>moved</p>' }, { t: Date.parse('2026-10-07T04:40:00Z') });
    await expect(source.fetch([decision], signal)).rejects.toThrow('page changed shape');
  });
});
