import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { root: '../..', name: 'gates', environment: 'node', include: ['tools/gates/**/*.spec.ts'] },
});
