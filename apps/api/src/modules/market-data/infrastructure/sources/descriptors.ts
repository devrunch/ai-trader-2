import type { SourceDescriptor } from '../../../../shared/sources';

// Descriptor-only: these vendors keep their own sockets and SDKs, so the registry lists them for the admin view and the key check.
const KITE_DESCRIPTOR: SourceDescriptor = {
  id: 'kite', owner: 'market-data', kind: 'ticks, bars, 5-level depth, instruments', markets: ['india'], envKeys: ['ZERODHA_API_KEY'],
  rateLimit: { requests: 3, windowSec: 1 }, schedule: 'on-demand',
  terms: 'Zerodha Kite Connect with the owner\'s own subscription: websocket ticker and the historical-data API within its 3 requests per second limit; personal use only.',
  docs: 'https://kite.trade/docs/connect/v3/',
};
const DERIV_DESCRIPTOR: SourceDescriptor = {
  id: 'deriv', owner: 'market-data', kind: 'ticks, bars, bid/ask', markets: ['forex', 'crypto', 'commodities'], envKeys: [],
  rateLimit: { requests: 1, windowSec: 1 }, schedule: 'on-demand',
  terms: 'Deriv\'s public websocket (api.derivws.com options/ws/public); market data needs no account or key.',
  docs: 'https://developers.deriv.com/',
};
const YAHOO_DELAYED_DESCRIPTOR: SourceDescriptor = {
  id: 'yahoo-delayed', owner: 'market-data', kind: 'quotes and bars about 15 minutes delayed', markets: ['us'], envKeys: [],
  rateLimit: { requests: 1, windowSec: 60 }, schedule: '* * * * *',
  terms: 'Yahoo Finance chart data through yahoo-finance2, polled once a minute and labelled delayed; no key, polite use for a personal tool.',
  docs: 'https://finance.yahoo.com/',
};
export const MARKET_DATA_DESCRIPTORS: SourceDescriptor[] = [KITE_DESCRIPTOR, DERIV_DESCRIPTOR, YAHOO_DELAYED_DESCRIPTOR];
