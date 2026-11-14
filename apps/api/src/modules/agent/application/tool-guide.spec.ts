import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const names = readdirSync(__dirname).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  .flatMap(f => [...readFileSync(join(__dirname, f), 'utf8').matchAll(/guardedTool\(\{ name: '([A-Za-z]+)'/g)].map(m => m[1] ?? ''));
const guide = readFileSync(join(__dirname, '..', 'prompts', 'system.md'), 'utf8');

it('lists every agent tool, including each AG-7..AG-9 data tool, in the system prompt tool guide', () => {
  for (const tool of ['getDepth', 'getFundamentals', 'scanUniverse', 'watchScreen', 'getEventScorecard', 'getSentiment', 'getCrowd', 'webSearch', 'getMarketStatus', 'listUniverse']) expect(names).toContain(tool);
  const missing = [...new Set(names)].filter(n => !guide.includes(`\`${n}\``));
  expect(missing).toEqual([]);
});
