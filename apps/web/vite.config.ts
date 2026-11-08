import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: { conditions: ['source', 'development', 'node', 'import'] },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.spec.tsx'],
  },
});
