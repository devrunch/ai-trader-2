import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

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
  },
});
