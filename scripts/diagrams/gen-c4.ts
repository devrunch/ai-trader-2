import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const layers = new Map([['api', 'api'], ['application', 'app'], ['domain', 'domain'], ['infrastructure', 'infra']]);
const description = "description 'generated from code — do not edit'";
const id = (name: string) => name.replaceAll(/[^a-zA-Z0-9_]/g, '_');
const quote = (name: string) => `'${name.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
function directories(root: string, path: string): string[] {
  const directory = resolve(root, path);
  return existsSync(directory) ? readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !['node_modules', 'dist', 'coverage'].includes(entry.name))
    .map(entry => entry.name).sort() : [];
}
interface Element { path: string; ref: string; kind: string; module?: string; }
function component(name: string, title: string, indent = '    ', contents: string[] = []): string {
  return `${indent}${name} = component ${quote(title)} {\n${indent}  ${description}\n${contents.join('')}${indent}}\n`;
}
// Keep component declarations and path mappings together so relationship targets match the model.
function inventory(root: string) {
  const elements: Element[] = [];
  const modules = directories(root, 'apps/api/src/modules');
  const api: string[] = [];
  for (const name of modules) {
    const path = `apps/api/src/modules/${name}`;
    const ref = `aitrader.api.mod_${id(name)}`;
    elements.push({ path, ref, kind: 'module', module: name });
    const nested = ["      technology 'NestJS module'\n"];
    for (const [folder, layer] of layers) {
      if (!existsSync(resolve(root, path, folder))) continue;
      elements.push({ path: `${path}/${folder}`, ref: `${ref}.${layer}`, kind: 'layer', module: name });
      nested.push(component(layer, folder, '      '));
    }
    api.push(component(`mod_${id(name)}`, name, '    ', nested));
  }
  const web: string[] = [];
  for (const [base, prefix, output, container] of [
    ['apps/api/src/shared', 'shared_', api, 'api'],
    ['apps/web/src/shared', 'shared_', web, 'web'],
    ['apps/web/src/features', 'feat_', web, 'web'],
  ] satisfies [string, string, string[], string][]) {
    for (const name of directories(root, base)) {
      const ref = `aitrader.${container}.${prefix}${id(name)}`;
      elements.push({ path: `${base}/${name}`, ref, kind: prefix === 'feat_' ? 'feature' : 'shared' });
      const vendors = container === 'api' && name === 'vendors' ? directories(root, `${base}/${name}`) : [];
      const nested = vendors.map(vendor => {
        elements.push({ path: `${base}/${name}/${vendor}`, ref: `${ref}.shared_vendors_${id(vendor)}`, kind: 'shared' });
        return component(`shared_vendors_${id(vendor)}`, vendor, '      ');
      });
      output.push(component(`${prefix}${id(name)}`, name, '    ', nested));
    }
  }
  if (existsSync(resolve(root, 'apps/web/src/app'))) {
    elements.push({ path: 'apps/web/src/app', ref: 'aitrader.web.app', kind: 'app' });
    web.push(component('app', 'app'));
  }
  const packages = directories(root, 'packages').map(name => {
    elements.push({ path: `packages/${name}`, ref: `pkg_${id(name)}`, kind: 'package' });
    return component(`pkg_${id(name)}`, name, '  ');
  });
  return { elements, modules, api, web, packages };
}
function importEdge(from: Element, to: Element): string | undefined {
  let source = from.ref;
  let target = to.ref;
  if (from.module && to.module) {
    if (from.module !== to.module) {
      source = `aitrader.api.mod_${id(from.module)}`;
      target = `aitrader.api.mod_${id(to.module)}`;
    } else if (from.kind !== 'layer' || to.kind !== 'layer') return;
  } else if (to.kind === 'package' && (from.module || from.kind === 'shared')) {
    if (from.module) source = `aitrader.api.mod_${id(from.module)}`;
  } else if (!(from.kind === 'feature' && to.kind === 'shared' && to.ref.startsWith('aitrader.web.'))) return;
  return source === target ? undefined : `  ${source} -[calls]-> ${target} 'imports'`;
}
function isArray(value: unknown): value is unknown[] { return Array.isArray(value); }
function edges(root: string, elements: Element[]): string[] {
  const json: unknown = JSON.parse(execFileSync(process.execPath, [
    resolve('node_modules/dependency-cruiser/bin/dependency-cruiser.mjs'),
    'apps', 'packages', '--config', resolve('.dependency-cruiser.cjs'), '--output-type', 'json',
    '--exclude', '\\.(?:spec|int-spec|config)\\.',
  ], { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024 }));
  if (!json || typeof json !== 'object' || !('modules' in json) || !isArray(json.modules)) {
    throw new Error('Invalid dependency-cruiser JSON: modules missing');
  }
  const ordered = [...elements].sort((a, b) => b.path.length - a.path.length);
  const find = (path: string) => ordered.find(element => path.replaceAll('\\', '/').startsWith(`${element.path}/`));
  const result = new Set<string>();
  for (const entry of json.modules) {
    if (!entry || typeof entry !== 'object' || !('source' in entry) || typeof entry.source !== 'string'
      || !('dependencies' in entry) || !isArray(entry.dependencies)) throw new Error('Invalid dependency module');
    const from = find(entry.source);
    if (!from) continue;
    for (const dependency of entry.dependencies) {
      if (!dependency || typeof dependency !== 'object' || !('resolved' in dependency) || typeof dependency.resolved !== 'string') {
        throw new Error('Invalid resolved dependency');
      }
      const to = find(dependency.resolved);
      const edge = to && importEdge(from, to);
      if (edge) result.add(edge);
    }
  }
  return [...result].sort();
}
function view(name: string, scope: string, include: string): string {
  return `  view ${name} of ${scope} {\n    ${description}\n    include ${include}\n  }\n`;
}
export function generateC4(repoRoot: string): string {
  const { elements, modules, api, web, packages } = inventory(repoRoot);
  const packageRefs = elements.filter(element => element.kind === 'package').map(element => element.ref);
  return `model {\n  extend aitrader.api {\n${api.join('')}  }\n  extend aitrader.web {\n${web.join('')}  }\n${packages.join('')}${edges(repoRoot, elements).join('\n')}\n}\n\nviews {\n`
    + view('api_code', 'aitrader.api', ['aitrader.api.*', ...packageRefs].join(', '))
    + view('web_code', 'aitrader.web', 'aitrader.web.*')
    + modules.map(name => view(`module_${id(name)}`, `aitrader.api.mod_${id(name)}`, `aitrader.api.mod_${id(name)}.*`)).join('')
    + '}\n';
}
