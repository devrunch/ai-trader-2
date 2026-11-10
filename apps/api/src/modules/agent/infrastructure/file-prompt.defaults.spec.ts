import { describe, expect, it } from 'vitest';
import { FilePromptDefaults } from './file-prompt.defaults';

describe('FilePromptDefaults', () => {
  it('lists the shipped prompt files and reads them', () => {
    const defaults = new FilePromptDefaults();
    expect(defaults.keys()).toEqual(expect.arrayContaining(['system', 'skill-position-sizing', 'skill-trend-check']));
    expect(defaults.read('system')).toContain('You never touch a real broker account');
  });
  it('refuses path tricks and unknown keys', () => {
    const defaults = new FilePromptDefaults();
    expect(defaults.read('../secrets')).toBeNull();
    expect(defaults.read('missing')).toBeNull();
  });
});
