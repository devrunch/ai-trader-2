import { expect, it, vi } from 'vitest';
import { DerivSource } from './index.js';
import { clock, signal } from './source-fixtures.spec-helper.js';

it('FR-SY-1/2/3 maps forex to FX and metals to OANDA', async () => {
  const network = vi.fn();
  const snapshot = await new DerivSource(network, clock).fetch(signal());
  expect(network).not.toHaveBeenCalled();
  expect(snapshot.instruments).toHaveLength(29);
  expect(snapshot.instruments.find((entry) => entry.id.toString() === 'FX:USDJPY')).toMatchObject({ pricescale: 1000, currency: 'JPY', timezone: 'UTC', session: '24x5', volumeType: 'tick' });
  expect(snapshot.instruments.find((entry) => entry.id.toString() === 'OANDA:XAUUSD')).toMatchObject({ type: 'metal', pricescale: 100, description: 'Gold/USD' });
  expect(snapshot.mappings.find((entry) => entry.id === 'FX:EURUSD')?.providerSymbol).toBe('frxEURUSD');
});
