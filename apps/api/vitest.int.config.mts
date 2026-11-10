import { defineConfig } from 'vitest/config';
import base from './vitest.config.mjs';

/** Timing budgets; they run alone in test:perf because parallel containers skew them. */
export const PERF_TESTS = /100,000 instruments/;

export default defineConfig({
  ...base,
  test: { name: 'infra', include: ['test/**/*.int-spec.ts'], testNamePattern: new RegExp(`^(?!.*(?:${PERF_TESTS.source}))`), hookTimeout: 60_000, testTimeout: 30_000, reporters: ['verbose'] },
});
