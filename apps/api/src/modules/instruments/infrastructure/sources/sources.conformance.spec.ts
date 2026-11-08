import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, AbortedError } from '@aitrader/resilience';
import { Logger } from '@nestjs/common';
import { InstrumentId } from '../../domain/index.js';
import { INSTRUMENT_SOURCES, DerivSource, KiteSource, NasdaqSource } from './index.js';
import { clock, fixtureText, signal } from './source-fixtures.spec-helper.js';
import type { FetchText } from './source-runtime.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe.each([new KiteSource(fixtureText, clock), new DerivSource(fixtureText, clock), new NasdaqSource(fixtureText, clock)])('FR-SY-1/3 R-11 $name', (source) => {
  it('every source output passes InstrumentId.parse', async () => {
    for (const entry of (await source.fetch(signal())).instruments) expect(InstrumentId.parse(entry.id.toString()).toString()).toBe(entry.id.toString());
  });
  it('no duplicate ids', async () => {
    const ids = (await source.fetch(signal())).instruments.map((entry) => entry.id.toString());
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every instrument has exactly one mapping per provider', async () => {
    const snapshot = await source.fetch(signal());
    expect(snapshot.mappings).toHaveLength(snapshot.instruments.length);
    for (const entry of snapshot.instruments) expect(snapshot.mappings.filter((mapping) => mapping.id === entry.id.toString())).toHaveLength(1);
  });
  it('no vendor symbol inside id', async () => {
    for (const entry of (await source.fetch(signal())).instruments) {
      expect(entry.id.toString()).not.toMatch(/frx|FUT$|\d(?:CE|PE)$/);
      if (source.name === 'kite') expect(entry.ticker).not.toMatch(/\s/);
    }
  });
});
it('FR-MD-1 kite source fetches the four exchanges with X-Kite-Version 3', async () => {
  const network = vi.fn(async (url: string, ...options: [RequestInit?]) => { expect(options).toHaveLength(1); return new Response(await fixtureText(url)); });
  vi.stubGlobal('fetch', network);
  await new KiteSource(undefined, clock).fetch(signal());
  expect(typeof INSTRUMENT_SOURCES).toBe('symbol');
  expect(network.mock.calls.map(([url]) => url).sort()).toEqual(['BSE', 'MCX', 'NFO', 'NSE'].map((exchange) => `https://api.kite.trade/instruments/${exchange}`));
  for (const call of network.mock.calls) {
    expect(call[1]?.headers).toEqual({ 'X-Kite-Version': '3' });
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  }
});

describe.each([KiteSource, NasdaqSource])('E6 source resilience', (Source) => {
  it('returns PROVIDER_DOWN without a network call after three failures and recovers after cooldown', async () => {
    let now = clock();
    const network = vi.fn<FetchText>(() => Promise.reject(new Error('offline')));
    const source = new Source(network, () => now);
    for (let attempt = 0; attempt < 3; attempt++) await expect(source.fetch(signal())).rejects.toThrow('offline');
    const calls = network.mock.calls.length;
    await expect(source.fetch(signal())).rejects.toMatchObject({ code: 'UNAVAILABLE', details: { reason: 'PROVIDER_DOWN' } });
    expect(network).toHaveBeenCalledTimes(calls);
    now = new Date(now.getTime() + 15 * 60000);
    network.mockImplementation(fixtureText);
    expect((await source.fetch(signal())).instruments.length).toBeGreaterThan(0);
  });
  it('aborts a stalled outbound request after 30 seconds', async () => {
    vi.useFakeTimers();
    const children: AbortSignal[] = [];
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      if (init.signal) children.push(init.signal);
      return new Promise<Response>(() => {});
    });
    const pending = new Source(undefined, clock).fetch(signal());
    const rejected = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(30000);
    await rejected;
    expect(children.length).toBeGreaterThan(0);
    expect(children.every((child) => child.aborted)).toBe(true);
  });
  it('propagates caller cancellation to outbound requests', async () => {
    const children: AbortSignal[] = [];
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      if (init.signal) children.push(init.signal);
      return new Promise<Response>(() => {});
    });
    const parent = new AbortController();
    const pending = new Source(undefined, clock).fetch(parent.signal);
    const rejected = expect(pending).rejects.toBeInstanceOf(AbortedError);
    parent.abort();
    await rejected;
    expect(children.every((child) => child.aborted)).toBe(true);
  });
  it('rejects a non-success listing response', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('private response', { status: 503 })));
    await expect(new Source(undefined, clock).fetch(signal())).rejects.toMatchObject({ code: 'UNAVAILABLE', message: 'Instrument listing request failed', details: { status: 503 } });
  });
});

it('E23 uses the injected Kolkata date to mark expired dated contracts', async () => {
  const source = new KiteSource(fixtureText, () => new Date('2026-11-23T18:30:00Z'));
  const snapshot = await source.fetch(signal());
  expect(snapshot.instruments.find((entry) => entry.ticker === 'NIFTYX2026')?.status).toBe('expired');
  expect(snapshot.instruments.find((entry) => entry.ticker === 'NIFTY1!')?.status).toBe('active');
  const onExpiry = await new KiteSource(fixtureText, () => new Date('2026-11-23T18:29:59Z')).fetch(signal());
  expect(onExpiry.instruments.find((entry) => entry.ticker === 'NIFTYX2026')?.status).toBe('active');
});

it('FR-SY-3 counts skipped Kite rows in one aggregate log', async () => {
  const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  const source = new KiteSource(async (url) => (await fixtureText(url)).replaceAll(',EQ,', ',BOND,'), clock);
  await source.fetch(signal());
  expect(log).toHaveBeenCalledExactlyOnceWith({ skipped: 17 });
});
