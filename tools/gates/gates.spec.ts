import { cruise } from 'dependency-cruiser';
import extractOptions from 'dependency-cruiser/config-utl/extract-depcruise-options';
import { ESLint } from 'eslint';
import { expect, it } from 'vitest';

// SRD §10.1, §14: R-1 through R-7 and R-12.
async function violations(fixture: string) {
  const options = await extractOptions('./.dependency-cruiser.cjs');
  const result = await cruise([`tools/gates/fixtures/${fixture}`], {
    ...options,
  });
  if (typeof result.output === 'string') throw new Error('Expected structured cruise output');
  return result.output.summary.violations;
}

it.each([
  ['rejects domain importing @nestjs/common', 'domain-imports-nest', 'domain-no-framework'],
  ['rejects application importing infrastructure', 'application-imports-infra', 'application-no-infrastructure'],
  ['rejects api importing infrastructure', 'api-imports-infra', 'api-application-only'],
  ["rejects importing another module's internals", 'cross-module-internal', 'module-public-api-only'],
  ['rejects shared importing modules', 'shared-imports-module', 'shared-no-modules'],
  ['rejects cycles', 'cycle', 'no-circular'],
  ["rejects a web feature importing another feature's internals", 'web-feature-internal', 'web-feature-public-api-only'],
])('%s', async (_name, fixture, rule) => {
  const names = (await violations(fixture)).map((violation) => violation.rule.name);
  expect(names).toContain(rule);
  if (fixture === 'api-imports-infra') expect(names).toContain('infrastructure-no-api');
  if (fixture === 'web-feature-internal') expect(names).toContain('web-shared-no-features');
});

it('accepts a correct module tree', async () => {
  expect(await violations('valid')).toEqual([]);
});

it('accepts a correct web feature tree', async () => {
  expect(await violations('web-valid')).toEqual([]);
});

// NFR-QL-1; R-9. lintText must cover files that do not yet exist on disk.
it('rejects any and process.env', async () => {
  const results = await new ESLint().lintText('const value: any = process.env.PORT;\n', {
    filePath: 'apps/api/src/x.ts',
  });
  expect(results.flatMap((result) => result.messages.map((message) => message.ruleId)))
    .toEqual(expect.arrayContaining(['@typescript-eslint/no-explicit-any', 'no-restricted-properties']));
}, 120_000); // type-aware lint of the whole project is slow under a full parallel run
