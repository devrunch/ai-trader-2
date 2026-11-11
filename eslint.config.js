import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'tools/gates/fixtures/**', 'architecture/generated/**', 'spikes/**'] },
  {
    files: ['**/*.{ts,tsx,mts}'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts', 'tools/gates/*.ts', 'tools/gates/*.mts', 'apps/api/src/x.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Nest modules are decorator metadata containers.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    files: ['**/*.{js,cjs,mjs,ts,tsx,mts}'],
    ignores: ['apps/api/src/main.ts', 'apps/api/src/migrate.ts', '**/*.config.*', 'scripts/smoke/**'],
    rules: { 'no-restricted-properties': ['error', { object: 'process', property: 'env', message: 'Inject APP_CONFIG instead.' }] },
  },
  { files: ['apps/*/src/**/*.{ts,tsx}'], ignores: ['apps/api/src/main.ts', 'apps/api/src/migrate.ts'], rules: { 'no-console': 'error' } },
  { files: ['apps/web/**/*.{ts,tsx}'], plugins: { 'react-hooks': reactHooks }, rules: reactHooks.configs.recommended.rules },
  { files: ['apps/web/src/**/*.tsx'], rules: { 'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }] } },
);
