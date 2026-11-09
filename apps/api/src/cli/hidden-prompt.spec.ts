import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readHidden } from './hidden-prompt.js';

function makePrompt(question: string) {
  const input = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  input.setRawMode = () => undefined;
  const output = new PassThrough(); let printed = '';
  output.on('data', chunk => { printed += String(chunk); });
  return { input, output, printed: () => printed, read: readHidden(input, output, question) };
}

describe('hidden password prompt NFR-SC-1', () => {
  it('two sequential prompts both read their value', async () => {
    const prompt = makePrompt('Password: '); prompt.input.write('first\r');
    await expect(prompt.read).resolves.toBe('first');
    const next = readHidden(prompt.input, prompt.output, 'Confirm: '); prompt.input.write('second\r');
    await expect(next).resolves.toBe('second');
  });
  it('a pasted chunk ending in CR resolves', async () => {
    const prompt = makePrompt('Password: '); prompt.input.write('pasted-secret\r');
    await expect(prompt.read).resolves.toBe('pasted-secret');
  });
  it('backspace removes the last character', async () => {
    const prompt = makePrompt('Password: '); prompt.input.write('secreX\u007f\r');
    await expect(prompt.read).resolves.toBe('secre');
  });
  it('ctrl-c rejects', async () => {
    const prompt = makePrompt('Password: '); prompt.input.write('partial\u0003');
    await expect(prompt.read).rejects.toThrow('Cancelled');
  });
  it('the typed value is never written to output', async () => {
    const prompt = makePrompt('Password: '); prompt.input.write('secret-value\r');
    await prompt.read; expect(prompt.printed()).not.toContain('secret-value');
  });
});
