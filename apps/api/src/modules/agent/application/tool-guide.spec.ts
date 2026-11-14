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

it('tells the assistant to promise in plain words and never name its internals', () => {
  expect(guide).toContain('## Plain promises');
  expect(guide).toContain('If Reliance closes above 1,350, I will buy 120 shares on paper with a stop at 1,331');
  for (const word of ['watcher', 'task', 'desk run', 'skill', 'requireBacktest']) expect(guide).toContain(`"${word}"`);
});

it('says when to ask the desk and how tools load', () => {
  expect(guide).toContain('`askDesk`');
  expect(guide).toContain('`loadTools`');
  for (const group of ['screening', 'events', 'news-deep', 'execution', 'chart', 'strategies', 'research']) expect(guide).toContain(group);
});
