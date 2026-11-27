#!/usr/bin/env node
// Fast check of what changed against origin/main (committed, staged, unstaged and new files): lint those files, typecheck the touched apps,
// run only the tests that import them, and the integration tests only when database, Redis or job code changed. The full gate is `pnpm check:code`.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const sh = cmd => execSync(cmd, { encoding: 'utf8' }).trim();
const run = (label, cmd, args) => {
  const started = Date.now();
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  console.log(`\n${r.status === 0 ? 'ok  ' : 'FAIL'} ${label} (${Math.round((Date.now() - started) / 1000)} s)`);
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const base = sh('git merge-base HEAD origin/main');
const changed = [...new Set([
  ...sh(`git diff --name-only ${base}`).split('\n'),
  ...sh('git ls-files --others --exclude-standard').split('\n'),
])].filter(f => f && existsSync(f));
const code = changed.filter(f => /\.(ts|tsx|mts|mjs)$/.test(f));
if (code.length === 0) { console.log('No code changes against origin/main.'); process.exit(0); }
console.log(`${String(code.length)} changed code file(s).`);

if (changed.some(f => f.startsWith('packages/'))) run('build packages', 'pnpm', ['build:packages']);
run('lint (changed files)', 'pnpm', ['exec', 'eslint', '--cache', '--cache-location', 'node_modules/.cache/eslint/', ...code]);
for (const app of ['apps/api', 'apps/web']) {
  if (code.some(f => f.startsWith(`${app}/`) || f.startsWith('packages/'))) run(`typecheck ${app}`, 'pnpm', ['--dir', app, 'exec', 'tsc', '--noEmit', '--incremental', '--tsBuildInfoFile', 'node_modules/.cache/tsc/tsbuildinfo']);
}
const sources = code.filter(f => !/\.(spec|int-spec)\.tsx?$/.test(f) && !f.startsWith('scripts/'));
const specs = code.filter(f => /\.spec\.tsx?$/.test(f));
if (sources.length || specs.length) run('tests related to the change', 'pnpm', ['exec', 'vitest', 'related', '--run', '--passWithNoTests', ...sources, ...specs]);
const infra = code.filter(f => /\/(infrastructure|database|redis|jobs)\//.test(f) || f.endsWith('.int-spec.ts') || f.startsWith('apps/api/drizzle/'));
if (infra.length) run('integration tests (database/Redis/jobs changed)', 'pnpm', ['--dir', 'apps/api', 'exec', 'vitest', 'run', '--config', 'vitest.int.config.mts']);
console.log('\nFast check passed. Run `pnpm check:code` once before a deploy.');
