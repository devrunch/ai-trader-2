import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FilePromptDefaults } from './file-prompt.defaults';

const application = join(__dirname, '..', 'application');
/** The tool names registered in `application/*.ts` (not specs), which is all a skill may mention in backticks. */
const tools = new Set(readdirSync(application).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  .flatMap(f => [...readFileSync(join(application, f), 'utf8').matchAll(/name: '([a-z][a-zA-Z]+)'/g)].map(m => m[1] ?? '')));
const defaults = new FilePromptDefaults();
const skills = defaults.keys().filter(k => k.startsWith('skill-'));
const NEW = ['breakout-trading', 'gap-trading', 'pullback-trading', 'momentum-trading', 'earnings-reaction', 'sector-overview', 'idea-screen', 'backtest-review', 'breakout-trade-plan', 'momentum-burst', 'vcp-setup'];

describe('skill prompts', () => {
  it('ships the vendored trading skills with the existing ones', () => {
    expect(skills).toEqual(expect.arrayContaining(NEW.map(n => `skill-${n}`)));
    expect(skills.length).toBeGreaterThanOrEqual(24);
  });

  it.each(skills)('%s loads with a title, a summary and a body', key => {
    const text = defaults.read(key) ?? '';
    const [title = '', summary = ''] = text.split('\n').map(l => l.replace(/^#\s*/, '').trim()).filter(Boolean);
    expect(text.startsWith('# ')).toBe(true);
    expect(title.length).toBeGreaterThan(2);
    expect(summary.length).toBeGreaterThan(10);
    expect(text.split('\n').filter(l => l.trim()).length).toBeGreaterThanOrEqual(4);
  });

  it.each(skills)('%s names only tools the assistant has, and no scripts', key => {
    const text = defaults.read(key) ?? '';
    const named = [...text.matchAll(/`([A-Za-z][A-Za-z0-9_]*)\(?[^`]*`/g)].map(m => m[1] ?? '').filter(n => /^(get|list|propose|place|cancel|close|create|schedule|run|use|add|remove|remember|forget|search|calculate|scan|watch|present|ask|load|save)([A-Z]|$)/.test(n));
    for (const name of named) expect(tools, `${key} mentions \`${name}\``).toContain(name);
    expect(text).not.toMatch(/\.py\b|\.sh\b|python|npm |curl |https?:\/\//i);
  });

  it.each(skills)('%s says what data it needs', key => {
    const needs = (defaults.read(key) ?? '').split('\n').find(l => l.startsWith('Needs:'));
    expect(needs, `${key} has no Needs: line`).toBeDefined();
    expect((needs ?? '').length).toBeGreaterThan(12);
  });

  it('screens markets with scanUniverse, not symbol-by-symbol bars', () => {
    for (const key of ['skill-idea-screen', 'skill-sector-overview', 'skill-dt-scanner']) expect(defaults.read(key)).toContain('`scanUniverse`');
  });

  it('uses plain words for promises, never the internal ones', () => {
    for (const key of skills) expect(defaults.read(key) ?? '', key).not.toMatch(/\b(watcher|desk run|requireBacktest)\b/i);
  });
});
