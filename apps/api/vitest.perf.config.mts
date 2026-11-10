import { defineConfig } from 'vitest/config';
import base from './vitest.config.mjs';

// Performance budgets run alone, one file at a time, after the parallel integration suite.
export default defineConfig({
  ...base,
  test: { name: 'perf', include: ['test/**/*.int-spec.ts'], testNamePattern: '100,000', env: { INT_PERF: '1' }, fileParallelism: false,
    hookTimeout: 60_000, testTimeout: 30_000, reporters: ['verbose'] },
});
