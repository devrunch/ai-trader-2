import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateClassDiagram } from './gen-class-diagrams.ts';

const generate = () => generateClassDiagram(resolve('tsconfig.base.json'), resolve('scripts/diagrams/fixtures/sample'));

describe('SRD §14 diagram duties', () => {
  it('emits implements edges', () => { expect(generate()).toContain('Port <|.. Impl'); });
  it('emits extends edges', () => { expect(generate()).toContain('Base <|-- Derived'); });
  it('emits injected dependencies', () => { expect(generate()).toContain('Service --> Port'); });
  it('lists public methods', () => { expect(generate()).toMatch(/class Service \{[^}]*\+run\(\) void/s); });
  it('is deterministic', () => { expect(generate()).toBe(generate()); });
  it('ignores declarations outside moduleDir', () => { expect(generate()).not.toMatch(/class (Promise|string)\b/); });
});
