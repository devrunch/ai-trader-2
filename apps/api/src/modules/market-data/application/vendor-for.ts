import type { FeedVendor } from './ports/feed-state-store';

const VENDOR_BY_EXCHANGE: Readonly<Record<string, FeedVendor>> = {
  NSE: 'kite', BSE: 'kite', MCX: 'kite', NFO: 'kite', FX: 'deriv', OANDA: 'deriv',
  NASDAQ: 'us-delayed', NYSE: 'us-delayed', NYSEARCA: 'us-delayed', AMEX: 'us-delayed', CBOE: 'us-delayed', IEX: 'us-delayed',
};

export function vendorFor(instrumentId: string): FeedVendor | undefined {
  return VENDOR_BY_EXCHANGE[instrumentId.split(':')[0] ?? ''];
}
