import { describe, expect, it } from 'vitest';
import type { SourceDescriptor } from './descriptor';
import { SourceRegistry } from './registry';

const descriptor = (id: string, envKeys: string[] = []): SourceDescriptor => ({ id, owner: 'news', kind: 'headlines', markets: ['global'], envKeys,
  rateLimit: { requests: 1, windowSec: 300 }, schedule: '*/5 * * * *', terms: 'public feed', docs: 'https://example.test' });

describe('SourceRegistry', () => {
  it('is enabled when the source needs no key', () => {
    const registry = new SourceRegistry({});
    registry.register(descriptor('rss-a'));
    expect(registry.isEnabled('rss-a')).toBe(true);
    expect(registry.list()[0]).toMatchObject({ state: 'enabled', missingKeys: [] });
  });

  it('is off, naming the key, when a key is unset or blank', () => {
    const registry = new SourceRegistry({ A_KEY: '   ', B_KEY: 'x' });
    registry.register(descriptor('multi', ['A_KEY', 'B_KEY', 'C_KEY']));
    expect(registry.isEnabled('multi')).toBe(false);
    expect(registry.list()[0]).toMatchObject({ state: 'off', missingKeys: ['A_KEY', 'C_KEY'] });
  });

  it('is enabled when every key is set', () => {
    const registry = new SourceRegistry({ NEWS_API_KEY: 'k' });
    registry.register(descriptor('newsapi', ['NEWS_API_KEY']));
    expect(registry.isEnabled('newsapi')).toBe(true);
  });

  it('throws for an unknown id, naming it', () => {
    expect(() => new SourceRegistry({}).get('nope')).toThrow('Unknown source "nope"');
    expect(() => new SourceRegistry({}).isEnabled('nope')).toThrow('Unknown source "nope"');
  });

  it('throws when two different descriptors share an id, and accepts the same one twice', () => {
    const registry = new SourceRegistry({});
    const first = descriptor('dup');
    registry.register(first);
    expect(() => { registry.register(first); }).not.toThrow();
    expect(registry.list()).toHaveLength(1);
    expect(() => { registry.register(descriptor('dup')); }).toThrow('Source "dup" is registered twice');
  });
});
