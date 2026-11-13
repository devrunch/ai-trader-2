import { describe, expect, it, vi } from 'vitest';
import { TimeoutError } from '@aitrader/resilience';
import { RateLimitedError } from '../errors';
import { SourceClient, SourceUnavailableError, type SourceBucket } from './client';
import type { SourceDescriptor } from './descriptor';
import type { SourceHealth } from './health';
import { SourceRegistry } from './registry';

const descriptor = (id: string, envKeys: string[] = []): SourceDescriptor => ({ id, owner: 'news', kind: 'headlines', markets: [], envKeys,
  rateLimit: { requests: 3, windowSec: 60 }, schedule: 'on-demand', terms: 't', docs: 'd' });

function setup(responses: Array<Response | Error>, bucket: SourceBucket = { take: () => Promise.resolve() }, env: Record<string, string> = {}) {
  const registry = new SourceRegistry(env);
  registry.register(descriptor('feed'), descriptor('keyed', ['THE_KEY']));
  const health = { success: vi.fn(() => Promise.resolve()), items: vi.fn(() => Promise.resolve()), failure: vi.fn(() => Promise.resolve()),
    rateLimited: vi.fn(() => Promise.resolve()), read: vi.fn(() => Promise.resolve({})) } satisfies SourceHealth;
  const queue = [...responses];
  const fetchFn = vi.fn<typeof fetch>(() => {
    const next = queue.shift();
    if (!next) throw new Error('no more responses');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const sleeps: number[] = [];
  const makeBucket = vi.fn(() => bucket);
  const client = new SourceClient(registry, health, makeBucket, { fetch: fetchFn, sleep: ms => { sleeps.push(ms); return Promise.resolve(); }, random: () => 0.5 });
  return { client, health, fetchFn, sleeps, makeBucket };
}

describe('SourceClient', () => {
  it('returns the body, sends the identifying user agent and records a success', async () => {
    const { client, health, fetchFn } = setup([new Response('hello', { status: 200 })]);
    const response = await client.get('feed', 'https://x.test/a', { headers: { accept: 'text/xml' } });
    expect(response).toMatchObject({ status: 200, text: 'hello' });
    const init = fetchFn.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ accept: 'text/xml', 'user-agent': expect.stringContaining('ai-trader') as string });
    expect(health.success).toHaveBeenCalledWith('feed', expect.objectContaining({ items: 0 }));
    expect(health.failure).not.toHaveBeenCalled();
  });

  it('refuses a disabled source without calling out', async () => {
    const { client, fetchFn } = setup([new Response('x')]);
    await expect(client.get('keyed', 'https://x.test')).rejects.toThrow('Source keyed is off (no key)');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('calls an enabled keyed source', async () => {
    const { client } = setup([new Response('ok')], undefined, { THE_KEY: 'k' });
    expect((await client.get('keyed', 'https://x.test')).text).toBe('ok');
  });

  it('throws for an unregistered source', async () => {
    await expect(setup([]).client.get('ghost', 'https://x.test')).rejects.toThrow('Unknown source "ghost"');
  });

  it('retries a 503 with backoff and succeeds', async () => {
    const { client, fetchFn, sleeps } = setup([new Response('', { status: 503 }), new Response('', { status: 502 }), new Response('fine')]);
    expect((await client.get('feed', 'https://x.test')).text).toBe('fine');
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('retries a 429, counts the rate-limit hit, and fails after three attempts', async () => {
    const { client, fetchFn, health } = setup([new Response('', { status: 429 }), new Response('', { status: 429 }), new Response('', { status: 429 })]);
    await expect(client.get('feed', 'https://x.test')).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(health.rateLimited).toHaveBeenCalledTimes(3);
    expect(health.failure).toHaveBeenCalledWith('feed', 'HTTP 429');
  });

  it('does not retry a 404 and records the failure', async () => {
    const { client, fetchFn, health, sleeps } = setup([new Response('nope', { status: 404 })]);
    await expect(client.get('feed', 'https://x.test')).rejects.toThrow('feed answered HTTP 404');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
    expect(health.failure).toHaveBeenCalledWith('feed', 'HTTP 404');
    expect(health.success).not.toHaveBeenCalled();
  });

  it('returns an allowed 4xx status without retrying or recording a failure', async () => {
    const { client, fetchFn, health } = setup([new Response('missing', { status: 404 })]);
    expect(await client.get('feed', 'https://x.test', { allowStatus: [404] })).toMatchObject({ status: 404, text: '' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(health.failure).not.toHaveBeenCalled();
  });

  it('still fails a 4xx that is not in the allowed list', async () => {
    const { client } = setup([new Response('no', { status: 403 })]);
    await expect(client.get('feed', 'https://x.test', { allowStatus: [404] })).rejects.toThrow('HTTP 403');
  });

  it('retries a network error, then reports it', async () => {
    const { client, fetchFn, health } = setup([new Error('ECONNRESET'), new Error('ECONNRESET'), new Error('ECONNRESET')]);
    await expect(client.get('feed', 'https://x.test')).rejects.toThrow('feed failed: ECONNRESET');
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(health.failure).toHaveBeenCalledWith('feed', 'ECONNRESET');
  });

  it('rejects a body over the cap (declared or streamed) without retrying, and records it', async () => {
    const declared = setup([new Response('x', { headers: { 'content-length': '5000' } })]);
    await expect(declared.client.get('feed', 'https://x.test', { maxBytes: 100 })).rejects.toThrow('larger than 100 bytes');
    expect(declared.health.failure).toHaveBeenCalledWith('feed', expect.stringContaining('larger than 100 bytes'));
    const streamed = setup([new Response('y'.repeat(500))]);
    await expect(streamed.client.get('feed', 'https://x.test', { maxBytes: 100 })).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(streamed.fetchFn).toHaveBeenCalledTimes(1);
  });

  it('times out a hung request and reports a failure', async () => {
    const registry = new SourceRegistry({});
    registry.register(descriptor('feed'));
    const { health } = setup([]);
    const client = new SourceClient(registry, health, () => ({ take: () => Promise.resolve() }), {
      fetch: (_url, init) => new Promise((_, reject) => { init?.signal?.addEventListener('abort', () => { reject(new Error('timed out')); }); }), sleep: () => Promise.resolve() });
    await expect(client.get('feed', 'https://x.test', { timeoutMs: 10 })).rejects.toThrow('feed failed: timed out');
    expect(health.failure).toHaveBeenCalledWith('feed', 'timed out');
  });

  it('stops retrying when the caller aborts', async () => {
    const controller = new AbortController();
    const { client, fetchFn } = setup([new Error('boom'), new Response('late')]);
    controller.abort();
    await expect(client.get('feed', 'https://x.test', { signal: controller.signal })).rejects.toBeInstanceOf(Error);
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('waits on the source token bucket before each call and builds one bucket per source from its limit', async () => {
    const take = vi.fn(() => Promise.resolve());
    const { client, makeBucket, fetchFn } = setup([new Response('a'), new Response('b')], { take });
    await client.get('feed', 'https://x.test/1');
    await client.get('feed', 'https://x.test/2');
    expect(take).toHaveBeenCalledTimes(2);
    expect(take).toHaveBeenCalledWith(expect.any(AbortSignal), 10_000);
    expect(makeBucket).toHaveBeenCalledTimes(1);
    expect(makeBucket).toHaveBeenCalledWith('feed', { requests: 3, windowSec: 60 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not call out when the bucket gives up, and counts the rate-limit hit', async () => {
    const { client, fetchFn, health } = setup([new Response('x')], { take: () => Promise.reject(new RateLimitedError('wait exceeded', 5000)) });
    await expect(client.get('feed', 'https://x.test')).rejects.toBeInstanceOf(RateLimitedError);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(health.rateLimited).toHaveBeenCalledTimes(1);
    expect(health.failure).toHaveBeenCalledWith('feed', 'rate limit: wait exceeded');
  });

  it('counts a bucket wait that timed out as a rate-limit hit', async () => {
    const { client, health } = setup([], { take: () => Promise.reject(new TimeoutError('wait timed out')) });
    await expect(client.get('feed', 'https://x.test')).rejects.toBeInstanceOf(TimeoutError);
    expect(health.rateLimited).toHaveBeenCalledTimes(1);
  });

  it('passes the caller maxWaitMs to the bucket', async () => {
    const take = vi.fn(() => Promise.resolve());
    const { client } = setup([new Response('a')], { take });
    await client.get('feed', 'https://x.test', { maxWaitMs: 250 });
    expect(take).toHaveBeenCalledWith(expect.any(AbortSignal), 250);
  });

  describe('recordItems', () => {
    it('adds the parsed count to the 24-hour items', async () => {
      const { client, health } = setup([]);
      await client.recordItems('feed', 12);
      expect(health.items).toHaveBeenCalledWith('feed', 12);
      expect(health.failure).not.toHaveBeenCalled();
    });

    it('records zero items as a failure so a changed shape is visible', async () => {
      const { client, health } = setup([]);
      await client.recordItems('feed', 0);
      expect(health.failure).toHaveBeenCalledWith('feed', expect.stringContaining('zero items'));
      expect(health.items).not.toHaveBeenCalled();
    });
  });
});
