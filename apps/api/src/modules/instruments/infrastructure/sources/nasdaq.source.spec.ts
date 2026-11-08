import { expect, it } from 'vitest';
import { NasdaqSource } from './index.js';
import { clock, fixture, fixtureText, signal, silentSourceLogger } from './source-fixtures.spec-helper.js';

it('FR-SY-1/2 parses nasdaq files, skipping test issues and the footer', async () => {
  const snapshot = await new NasdaqSource(fixtureText, clock, silentSourceLogger).fetch(signal());
  expect(snapshot.instruments).toHaveLength(13);
  expect(snapshot.instruments.find((entry) => entry.ticker === 'QQQ')).toMatchObject({ type: 'etf', currency: 'USD', session: '0930-1600', timezone: 'America/New_York', pricescale: 100 });
  expect(snapshot.instruments.some((entry) => /TEST|ZZT|Creation/.test(entry.ticker))).toBe(false);
});
it('FR-SY-1 maps exchange codes', async () => {
  const text = fixture('nasdaq', 'otherlisted.txt').split('\n').slice(0, 1).join('') + '\n' + ['N', 'A', 'P', 'Z', 'V', '?'].map((code) => `${code}|Name|${code}|X|N|100|N|X`).join('\n');
  const snapshot = await new NasdaqSource((url) => Promise.resolve(url.endsWith('otherlisted.txt') ? text : fixture('nasdaq', 'nasdaqlisted.txt')), clock, silentSourceLogger).fetch(signal());
  expect(snapshot.instruments.slice(5).map((entry) => entry.id.toString())).toEqual(['NYSE:N', 'AMEX:A', 'NYSEARCA:P', 'CBOE:Z', 'IEX:V']);
});
it('FR-SY-1 keeps BRK.B', async () => {
  const snapshot = await new NasdaqSource(fixtureText, clock, silentSourceLogger).fetch(signal());
  expect(snapshot.mappings.find((entry) => entry.id === 'NYSE:BRK.B')).toEqual({ id: 'NYSE:BRK.B', provider: 'us-delayed', providerSymbol: 'BRK.B' });
});
