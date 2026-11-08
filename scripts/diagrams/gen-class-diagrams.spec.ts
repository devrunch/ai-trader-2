import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateClassDiagram } from './gen-class-diagrams.ts';

const generate = () => generateClassDiagram(resolve('tsconfig.base.json'), resolve('scripts/diagrams/fixtures/sample'));

// NFR-QL, SRD §14: allow CPU contention without rebuilding for every assertion.
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });
let diagram: string;
beforeAll(() => { diagram = generate(); });

describe('SRD §14 diagram duties', () => {
  it('emits implements edges', () => { expect(diagram).toContain('Port <|.. Impl'); });
  it('emits extends edges', () => { expect(diagram).toContain('Base <|-- Derived'); });
  it('emits injected dependencies', () => { expect(diagram).toContain('Service --> Port'); });
  it('lists public methods', () => { expect(diagram).toMatch(/class Service \{[^}]*\+run\(\) void/s); });
  it('is deterministic', () => { expect(diagram).toBe(generate()); });
  it('ignores declarations outside moduleDir', () => { expect(diagram).not.toMatch(/class (Promise|string)\b/); });
});
