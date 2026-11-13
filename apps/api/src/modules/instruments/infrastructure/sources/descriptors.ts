import type { SourceDescriptor } from '../../../../shared/sources';

// Descriptor-only: the adapter keeps its own fetch and circuit breaker.
export const NASDAQ_TRADER_DESCRIPTOR: SourceDescriptor = {
  id: 'nasdaq-trader', owner: 'instruments', kind: 'symbol directory', markets: ['us'], envKeys: [],
  rateLimit: { requests: 2, windowSec: 86_400 }, schedule: '0 7 * * *',
  terms: 'Nasdaq Trader symbol directory files (nasdaqlisted.txt, otherlisted.txt), published for free download; fetched once a day.',
  docs: 'https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs',
};
