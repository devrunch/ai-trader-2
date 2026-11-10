import { defineConfig } from 'vitest/config';
import base from './vitest.config.mjs';

import { NOT_PERF_TESTS } from './vitest.perf-tests.mjs';

export default defineConfig({
  ...base,
  test: { name: 'infra', include: ['test/**/*.int-spec.ts'], testNamePattern: NOT_PERF_TESTS, hookTimeout: 60_000, testTimeout: 30_000, reporters: ['verbose'] },
});
