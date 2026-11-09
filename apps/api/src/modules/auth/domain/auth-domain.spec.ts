import { describe, expect, it } from 'vitest';
import { validatePassword } from './password-policy';
import { normalizeUsername } from './user';
describe('auth domain FR-AC-1', () => {
  it('rejects passwords shorter than 12', () => { expect(() => { validatePassword('short'); }).toThrow(); });
  it('normalises usernames to lowercase and validates characters', () => {
    expect(normalizeUsername('Trader_One')).toBe('trader_one');
    expect(() => normalizeUsername('bad name')).toThrow();
  });
});
