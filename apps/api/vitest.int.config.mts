import { defineConfig } from 'vitest/config';
import base from './vitest.config.mjs';

export default defineConfig({
  ...base,
  test: { name: 'infra', include: ['test/**/*.int-spec.ts'], hookTimeout: 60_000, testTimeout: 30_000, reporters: ['verbose'] },
});
