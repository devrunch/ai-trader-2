import { defineConfig } from 'vitest/config';
import base from './vitest.config.mjs';
import { PERF_TESTS } from './vitest.int.config.mjs';

// Performance budgets run alone, one file at a time, after the parallel integration suite.
export default defineConfig({
  ...base,
  test: { name: 'perf', include: ['test/**/*.int-spec.ts'], testNamePattern: PERF_TESTS, fileParallelism: false,
    hookTimeout: 60_000, testTimeout: 30_000, reporters: ['verbose'] },
});
