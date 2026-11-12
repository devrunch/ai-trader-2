import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { PINE_COMPLETIONS } from '@aitrader/contracts';
import { describe, expect, it } from 'vitest';
import { pineCompletionSource } from './pine-completions';
import { pineLanguage } from './pine-language';

const entries = [
  { label: 'plot', kind: 'function', detail: 'plot(series)' },
  { label: 'ta.sma', kind: 'function', detail: 'Simple MA' },
  { label: 'ta.ema', kind: 'function', detail: 'Exponential MA' },
  { label: 'math.max', kind: 'function', detail: 'Max' },
  { label: 'close', kind: 'variable', detail: 'Close' },
  { label: 'if', kind: 'keyword', detail: 'if' },
] as const;

function labelsAt(doc: string, explicit = false): string[] | null {
  const state = EditorState.create({ doc, extensions: [pineLanguage] });
  const result = pineCompletionSource(entries)(new CompletionContext(state, doc.length, explicit));
  if (!(result instanceof Object) || 'then' in result) return null;
  return result.options.map((o) => o.label);
}

describe('pineCompletionSource', () => {
  it('offers only ta members after "ta."', () => { expect(labelsAt('x = ta.')).toEqual(['ta.sma', 'ta.ema']); });
  it('narrows by the typed member prefix', () => { expect(labelsAt('x = ta.s')).toContain('ta.sma'); });
  it('offers top-level names and namespaces, not members, at a bare word', () => {
    const labels = labelsAt('x = pl');
    expect(labels).toEqual(expect.arrayContaining(['plot', 'close', 'if', 'ta', 'math']));
    expect(labels).not.toContain('ta.sma');
  });
  it('offers nothing inside a comment', () => { expect(labelsAt('// ta.')).toBeNull(); });
  it('offers nothing inside a string', () => { expect(labelsAt('a = "ta.')).toBeNull(); });
  it('offers nothing when no word is being typed', () => { expect(labelsAt('x = ')).toBeNull(); });
  it('has a valid generated list', () => {
    expect(Array.isArray(PINE_COMPLETIONS)).toBe(true);
    for (const e of PINE_COMPLETIONS) expect(typeof e.label).toBe('string');
  });
});
