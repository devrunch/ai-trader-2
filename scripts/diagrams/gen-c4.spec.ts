import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateC4 } from './gen-c4.ts';
import './fixtures/c4/apps/api/src/modules/orders/api/index.ts';
import './fixtures/c4/apps/api/src/modules/orders/infrastructure/index.ts';
import './fixtures/c4/apps/api/src/shared/errors/index.ts';
import './fixtures/c4/apps/api/src/shared/vendors/kite/index.ts';
import './fixtures/c4/apps/web/src/features/terminal/index.ts';
import './fixtures/c4/apps/web/src/app/index.ts';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
const fixture = resolve('scripts/diagrams/fixtures/c4');
let output: string;
beforeAll(() => { output = generateC4(fixture); });
describe('SRD §14 generated C4 model', () => {
  it('emits one component per module with its layers', () => {
    expect(output.match(/mod_orders = component/g)).toHaveLength(1);
    for (const id of ['api', 'app', 'domain', 'infra']) expect(output).toContain(`${id} = component`);
    expect(output).toContain("technology 'NestJS module'");
    expect(output).toContain('view module_orders');
  });
  it('emits shared, vendor and package components', () => {
    for (const id of ['shared_errors', 'shared_vendors', 'shared_vendors_kite', 'pkg_contracts', 'feat_terminal', 'shared_api']) {
      expect(output).toContain(`${id} = component`);
    }
  });
  it('emits import edges collapsed to components without self-edges or duplicates', () => {
    const edges = output.split('\n').filter(line => line.includes('-[calls]->')).map(line => line.trim());
    expect(edges).toEqual([
      "aitrader.api.mod_orders -[calls]-> aitrader.api.mod_quotes 'imports'",
      "aitrader.api.mod_orders -[calls]-> pkg_contracts 'imports'",
      "aitrader.api.mod_orders.api -[calls]-> aitrader.api.mod_orders.app 'imports'",
      "aitrader.api.mod_orders.app -[calls]-> aitrader.api.mod_orders.domain 'imports'",
      "aitrader.api.mod_orders.infra -[calls]-> aitrader.api.mod_orders.app 'imports'",
      "aitrader.api.shared_errors -[calls]-> pkg_contracts 'imports'",
      "aitrader.web.feat_terminal -[calls]-> aitrader.web.shared_api 'imports'",
    ]);
  });
  it('is deterministic', () => { expect(generateC4(fixture)).toBe(output); });
  it('output validates with likec4', () => {
    mkdirSync('architecture/.tmp', { recursive: true });
    const directory = mkdtempSync(resolve('architecture/.tmp/c4-'));
    try {
      writeFileSync(`${directory}/generated.c4`, output);
      writeFileSync(`${directory}/spec.c4`, `specification { element system
element container
element component
relationship calls }
model { aitrader = system { api = container
web = container } }`);
      expect(() => execFileSync(process.execPath, [resolve('node_modules/likec4/bin/likec4.mjs'), 'validate', directory], { timeout: 25_000 })).not.toThrow();
    } finally { rmSync(directory, { recursive: true }); }
  });
});
