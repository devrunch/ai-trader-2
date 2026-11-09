import { describe, expect, it, vi } from 'vitest';
import { runCreateAdmin } from './create-admin.js';

describe('admin CLI errors NFR-SC-1', () => {
  it('cli prints the policy message for a short password and never the password', async () => {
    const output: string[] = [];
    const prompt = vi.fn().mockResolvedValueOnce('tiny-pass').mockResolvedValueOnce('tiny-pass');
    const create = vi.fn();
    await expect(runCreateAdmin({ username: 'owner', prompt, output: message => { output.push(message); }, create })).rejects.toThrow('Password must be at least 12 characters');
    expect(output.join('')).toContain('Password must be at least 12 characters');
    expect(output.join('')).not.toContain('tiny-pass'); expect(create).not.toHaveBeenCalled();
  });
});
