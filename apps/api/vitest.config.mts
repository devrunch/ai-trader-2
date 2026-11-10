import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { NOT_PERF_TESTS } from './vitest.perf-tests.mjs';

export default defineConfig({
  plugins: [swc.vite({
    jsc: {
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
    },
  })],
  resolve: { conditions: ['source', 'development', 'node', 'import'] },
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    testNamePattern: NOT_PERF_TESTS,
  },
});
