import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SourceClient, SourceRegistry, type SourceHealth } from '../../../shared/sources';
import { EIA_DESCRIPTOR, EiaSource } from './eia.source';
import { movesFor } from '../domain/moves';

function clientFor(body: string) {
  const registry = new SourceRegistry({});
  registry.register(EIA_DESCRIPTOR);
  const health = { success: vi.fn(() => Promise.resolve()), items: vi.fn(() => Promise.resolve()), failure: vi.fn(() => Promise.resolve()),
    rateLimited: vi.fn(() => Promise.resolve()), read: vi.fn(() => Promise.resolve({})) } satisfies SourceHealth;
  const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(body)));
  return { client: new SourceClient(registry, health, () => ({ take: () => Promise.resolve() }), { fetch: fetchFn, sleep: () => Promise.resolve() }), health };
}
const signal = new AbortController().signal;
const page = readFileSync(join(__dirname, '__fixtures__', 'eia', 'schedule.html'), 'utf8');
const now = Date.parse('2026-11-09T12:00:00Z');

describe('EIA weekly petroleum schedule', () => {
  it('lists Wednesdays 10:30 ET and moves the Veterans Day week to Thursday 12:00 ET (recorded page)', async () => {
    const { client, health } = clientFor(page);
    const events = await new EiaSource(client, () => now, 1, 20).fetch(signal);
    expect(events.map(e => e.at)).toEqual(['2026-11-12T17:00:00.000Z', '2026-11-18T15:30:00.000Z', '2026-11-25T15:30:00.000Z']);
    expect(events[0]).toEqual({ title: 'Crude Oil Inventories', country: 'USD', at: '2026-11-12T17:00:00.000Z', impact: 'High', forecast: null, previous: null });
    expect(health.items).toHaveBeenCalledWith('eia', 13);
  });

  it('follows daylight saving: 10:30 ET is 14:30 UTC in summer', async () => {
    const { client } = clientFor(page);
    const events = await new EiaSource(client, () => Date.parse('2026-07-06T00:00:00Z'), 0, 8).fetch(signal);
    expect(events.map(e => e.at)).toEqual(['2026-07-08T14:30:00.000Z']);
  });

  it('maps to crude oil instruments through the shared moves table', () => {
    expect(movesFor('USD', 'Crude Oil Inventories')[0]).toBe('MCX:CRUDEOIL1!');
  });

  it('fails when the page has no schedule rows', async () => {
    const { client, health } = clientFor('<html><body><table></table></body></html>');
    await expect(new EiaSource(client, () => now).fetch(signal)).rejects.toThrow('page shape changed');
    expect(health.items).not.toHaveBeenCalled();
  });
});
