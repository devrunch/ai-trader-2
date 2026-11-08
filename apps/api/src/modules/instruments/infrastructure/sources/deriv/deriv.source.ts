import { InstrumentId } from '../../../domain/instrument-id.js';
import type { Instrument } from '../../../domain/instrument.js';
import type { InstrumentSource, SourceSnapshot } from '../../../application/ports/instrument-source.js';
import type { Clock, FetchText } from '../source-runtime.js';
import { forexPairs, metalNames } from './deriv-pairs.js';

const metalAliases: Readonly<Record<string, string[]>> = {
  XAUUSD: ['GOLD', 'GOLD SPOT'], XAGUSD: ['SILVER', 'SILVER SPOT'],
  XPTUSD: ['PLATINUM'], XPDUSD: ['PALLADIUM'],
};

export class DerivSource implements InstrumentSource {
  readonly name = 'deriv';
  // Uniform construction with network sources; the fixed table requires neither dependency.
  constructor(readonly fetchText?: FetchText, readonly clock?: Clock) {}
  fetch(signal: AbortSignal): Promise<SourceSnapshot> {
    signal.throwIfAborted();
    const instruments = [...forexPairs, ...Object.keys(metalNames)].map((pair): Instrument => {
      const metal = metalNames[pair];
      const exchange = metal ? 'OANDA' : 'FX';
      const currency = pair.slice(-3);
      return {
        id: InstrumentId.parse(`${exchange}:${pair}`), exchange, ticker: pair,
        description: `${metal ?? pair.slice(0, 3)}/${currency}`, type: metal ? 'metal' : 'forex',
        currency, timezone: 'UTC', session: '24x5', pricescale: metal ? 100 : currency === 'JPY' ? 1000 : 100000,
        minmov: 1, lotSize: 1, volumeType: 'tick', hasIntraday: true, status: 'active', aliases: metalAliases[pair] ?? [],
      };
    });
    return Promise.resolve({ instruments, mappings: instruments.map((entry) => ({ id: entry.id.toString(), provider: 'deriv', providerSymbol: `frx${entry.ticker}` })) });
  }
}
