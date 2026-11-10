import { describe, expect, it } from 'vitest';
import { FilePromptDefaults } from './file-prompt.defaults';

describe('FilePromptDefaults', () => {
  it('lists the shipped prompt files and reads them', () => {
    const defaults = new FilePromptDefaults();
    expect(defaults.keys()).toContain('system');
    expect(defaults.read('system')).toContain('You never place, modify or cancel orders');
  });
  it('refuses path tricks and unknown keys', () => {
    const defaults = new FilePromptDefaults();
    expect(defaults.read('../secrets')).toBeNull();
    expect(defaults.read('missing')).toBeNull();
  });
});
