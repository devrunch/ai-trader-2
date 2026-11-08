import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const clock = () => new Date('2026-11-08T20:00:00Z');
export const signal = () => new AbortController().signal;
export function fixture(vendor: string, file: string): string {
  return readFileSync(resolve(__dirname, vendor, 'fixtures', file), 'utf8');
}
export function fixtureText(url: string): Promise<string> {
  const file = url.split('/').at(-1) ?? '';
  return Promise.resolve(file.endsWith('.txt') ? fixture('nasdaq', file) : fixture('kite', `${file.toLowerCase()}.csv`));
}
