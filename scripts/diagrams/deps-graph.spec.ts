import { expect, it } from 'vitest';
import { generateDependencyGraph } from './run.ts';

// AGENTS.md §7: the graph describes our production code.
it('deps graph contains no npm packages and no specs', () => {
  const graph = generateDependencyGraph();
  for (const excluded of ['@rolldown', '@vitejs', 'node_modules', '.spec.', '.config.', 'tsconfig']) {
    expect(graph).not.toContain(excluded);
  }
  expect(graph).toContain('packages/resilience');
}, 120_000);
