import { expect } from 'vitest';
import type { SourceDescriptor } from './descriptor';

/** What every registered source must declare (docs/DATA-SOURCES.md rule 3). */
export function expectConformingDescriptors(descriptors: SourceDescriptor[], owner: string): void {
  expect(new Set(descriptors.map(d => d.id)).size).toBe(descriptors.length);
  for (const d of descriptors) {
    expect(d.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(d.owner).toBe(owner);
    expect(d.kind.length).toBeGreaterThan(0);
    expect(d.schedule.length).toBeGreaterThan(0);
    expect(d.terms.length).toBeGreaterThan(20);
    expect(d.docs).toMatch(/^https?:\/\//);
    expect(d.rateLimit.requests).toBeGreaterThan(0);
    expect(d.rateLimit.windowSec).toBeGreaterThan(0);
    for (const key of d.envKeys) expect(key).toMatch(/^[A-Z][A-Z0-9_]+$/);
  }
}
