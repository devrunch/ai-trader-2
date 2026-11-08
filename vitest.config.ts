import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { projects: ['apps/api/vitest.config.mts', 'apps/web/vite.config.ts'] },
});
