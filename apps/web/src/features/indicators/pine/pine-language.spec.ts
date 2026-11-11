import { describe, expect, it } from 'vitest';
import { tokenizePine } from './pine-language';

const typeOf = (line: string, text: string): string | null => tokenizePine(line).find((t) => t.text === text)?.type ?? null;

describe('tokenizePine', () => {
  it('marks keywords', () => { expect(typeOf('if close > open', 'if')).toBe('keyword'); });
  it('marks types', () => { expect(typeOf('float x = 1', 'float')).toBe('type'); });
  it('marks a comment to the end of the line', () => {
    expect(tokenizePine('x = 1 // note')).toContainEqual({ text: '// note', type: 'comment' });
  });
  it('marks strings in both quote styles', () => {
    expect(typeOf('a = "hi"', '"hi"')).toBe('string');
    expect(typeOf("a = 'hi'", "'hi'")).toBe('string');
  });
  it('marks numbers including decimals', () => { expect(typeOf('x = 3.14', '3.14')).toBe('number'); });
  it('marks a namespaced builtin as one token', () => { expect(typeOf('y = ta.sma(close, 9)', 'ta.sma')).toBe('builtin'); });
  it('marks bare builtins such as plot', () => { expect(typeOf('plot(y)', 'plot')).toBe('builtin'); });
  it('marks the version annotation as meta, not a comment', () => {
    expect(tokenizePine('//@version=6')).toEqual([{ text: '//@version=6', type: 'meta' }]);
  });
  it('leaves plain identifiers and unknown namespaces unstyled', () => {
    expect(typeOf('myVal = 1', 'myVal')).toBe('variableName');
    expect(typeOf('foo.bar', 'foo.bar')).toBe('variableName');
  });
  it('marks the arrow and operators', () => {
    expect(typeOf('f(x) => x', '=>')).toBe('operator');
    expect(typeOf('a >= b', '>=')).toBe('operator');
  });
});
