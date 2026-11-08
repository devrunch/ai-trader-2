import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['apps/api/vitest.config.mts', 'apps/web/vite.config.ts', 'tools/gates/vitest.config.mts'],
    // NFR-QL-2: thresholds apply independently; empty globs pass.
    coverage: {
      provider: 'v8',
      include: ['apps/api/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}', 'packages/*/src/**'],
      exclude: ['**/*.spec.*', '**/*.int-spec.*', '**/*.config.*', '**/main.ts', '**/main.tsx'],
      thresholds: {
        'apps/api/src/modules/*/domain/**': { lines: 90 },
        'packages/*/src/**': { lines: 90 },
        'apps/api/src/modules/*/application/**': { lines: 80 },
      },
    },
  },
});
