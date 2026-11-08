import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

function snapshot(): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const root of ['architecture/generated', 'architecture/features']) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const path = `${entry.parentPath}/${entry.name}`.replaceAll('\\', '/');
      if (root.endsWith('/features') && entry.name !== 'classes.mmd') continue;
      hashes.set(path, createHash('sha256').update(readFileSync(path)).digest('hex'));
    }
  }
  const model = 'architecture/model/generated.c4';
  if (existsSync(model)) hashes.set(model, createHash('sha256').update(readFileSync(model)).digest('hex'));
  return hashes;
}

const before = snapshot();
execFileSync(process.execPath, ['scripts/diagrams/run.ts'], { stdio: 'inherit', timeout: 360_000 });
const after = snapshot();
const changed = [...new Set([...before.keys(), ...after.keys()])]
  .filter((path) => before.get(path) !== after.get(path)).sort();
if (changed.length) {
  console.error(`Stale generated files:\n${changed.map((path) => `  ${before.has(path) ? after.has(path) ? 'changed' : 'removed' : 'new'}: ${path}`).join('\n')}`);
  process.exitCode = 1;
} else console.log('Generated diagrams and reports are current.');
