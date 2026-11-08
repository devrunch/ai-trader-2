import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateC4 } from './gen-c4.ts';
import { generateClassDiagram } from './gen-class-diagrams.ts';

function command(binary: string, args: string[]): string {
  const executable = resolve(`node_modules/${binary}`);
  return execFileSync(process.execPath, [executable, ...args], {
    encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  }).replaceAll('\r\n', '\n');
}

export function generateDependencyGraph(): string {
  const graph = command('dependency-cruiser/bin/dependency-cruiser.mjs', [
    'apps', 'packages', '--config', '.dependency-cruiser.cjs', '--output-type', 'mermaid',
    '--exclude', 'node_modules|\\.(?:spec|int-spec|config)\\.|(?:^|/)tsconfig[^/]*|(?:^|/)(?:dist|coverage)/',
    '--include-only', '^(?:apps/[^/]+/src/(?:modules/|features/|shared/|app[/.])|packages/[^/]+/src/)',
    '--collapse', '^(apps/[^/]+/src/(?:(?:modules|features|shared)/[^/]+|app)|packages/[^/]+)',
  ]);
  const parents: string[] = [];
  return graph.split('\n').map(line => {
    if (line === 'end') parents.pop();
    const label = /^(subgraph )?[^[]+\["([^"]+)"\]$/.exec(line);
    if (!label) return line;
    const name = label[2] ?? '';
    if (label[1]) {
      parents.push(name);
      return line;
    }
    return line.replace(`["${name}"]`, `["${[...parents, name].join('/')}"]`);
  }).join('\n');
}

if (import.meta.main) {
  writeFileSync('architecture/model/generated.c4', generateC4(resolve('.')));
  mkdirSync('architecture/generated', { recursive: true });
  const expected = new Set<string>();
  for (const [directory, tsconfig] of [
    ['apps/api/src/modules', 'apps/api/tsconfig.json'],
    ['apps/web/src/features', 'apps/web/tsconfig.json'],
  ]) {
    if (!directory || !tsconfig || !existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const output = `architecture/features/${entry.name}/classes.mmd`;
      if (expected.has(output)) throw new Error(`Duplicate API/web feature name: ${entry.name}`);
      expected.add(output);
      mkdirSync(`architecture/features/${entry.name}`, { recursive: true });
      writeFileSync(output, generateClassDiagram(tsconfig, `${directory}/${entry.name}`));
    }
  }
  if (existsSync('architecture/features')) {
    for (const file of readdirSync('architecture/features', { recursive: true, encoding: 'utf8' })) {
      const path = `architecture/features/${file.replaceAll('\\', '/')}`;
      if (path.endsWith('/classes.mmd') && !expected.has(path)) rmSync(path);
    }
  }
  writeFileSync('architecture/generated/deps.mmd', generateDependencyGraph());
  writeFileSync('architecture/generated/knip.md', command('knip/bin/knip.js', ['--reporter', 'markdown']));
  process.stdout.write(command('jscpd/run-jscpd.js', []));
  if (existsSync('architecture/generated/jscpd-report.md')) rmSync('architecture/generated/jscpd-report.md');
  console.log('Regenerated architecture diagrams and reports.');
}
