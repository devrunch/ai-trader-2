import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tailwindcss(), react(), babel({ presets: [reactCompilerPreset()] })],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }, conditions: ['source', 'module', 'browser', 'development|production'] },
  test: {
    name: 'web',
    setupFiles: ['src/test-setup.ts'],
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
