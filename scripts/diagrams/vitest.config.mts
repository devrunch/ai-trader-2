import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { root: '../..', name: 'diagrams', environment: 'node', include: ['scripts/diagrams/**/*.spec.ts'] },
});
