import { vi } from 'vitest';
import { SourceClient, SourceRegistry, type SourceDescriptor, type SourceHealth } from '../../../../shared/sources';

/** A real SourceClient over a canned response: it exercises registry, size cap and health recording without a network or Redis. */
export function clientReturning(descriptors: SourceDescriptor[], body: string | (() => string), env: Record<string, string> = {}) {
  const registry = new SourceRegistry(env);
  registry.register(...descriptors);
  const health = { success: vi.fn(() => Promise.resolve()), items: vi.fn(() => Promise.resolve()), failure: vi.fn(() => Promise.resolve()),
    rateLimited: vi.fn(() => Promise.resolve()), read: vi.fn(() => Promise.resolve({})) } satisfies SourceHealth;
  const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(typeof body === 'string' ? body : body())));
  const client = new SourceClient(registry, health, () => ({ take: () => Promise.resolve() }), { fetch: fetchFn, sleep: () => Promise.resolve() });
  return { client, health, fetchFn };
}
