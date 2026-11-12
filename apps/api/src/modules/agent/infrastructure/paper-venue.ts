import type { PaperPlaceOrderRequest } from '@aitrader/contracts';
import type { ExecutionVenue, VenueFill, VenueOrder, VenuePosition } from '../application/execution-venue';

interface PaperServices {
  place: { execute(userId: string, request: PaperPlaceOrderRequest): Promise<unknown> };
  cancel: { execute(userId: string, orderId: string): Promise<unknown> };
  portfolio: {
    positions(userId: string): Promise<VenuePosition[]>;
    accountForInstrument(userId: string, symbol: string): Promise<{ initialCash: number; currency: string }>;
    orders(userId: string, filter: { openOnly: boolean; limit: number }): Promise<VenueOrder[]>;
    fills(userId: string, limit: number): Promise<VenueFill[]>;
  };
  quote: { execute(symbol: string): Promise<{ price: number }> };
}

/** The paper engine as an execution venue: the same use cases and risk limits as the user's own orders. */
export class PaperVenue implements ExecutionVenue {
  readonly kind = 'paper' as const;
  constructor(private readonly s: PaperServices) {}
  place(userId: string, request: PaperPlaceOrderRequest): Promise<unknown> { return this.s.place.execute(userId, request); }
  cancel(userId: string, orderId: string): Promise<unknown> { return this.s.cancel.execute(userId, orderId); }
  positions(userId: string): Promise<VenuePosition[]> { return this.s.portfolio.positions(userId); }
  account(userId: string, symbol: string): Promise<{ initialCash: number; currency: string }> { return this.s.portfolio.accountForInstrument(userId, symbol); }
  orders(userId: string): Promise<VenueOrder[]> { return this.s.portfolio.orders(userId, { openOnly: false, limit: 200 }); }
  fills(userId: string): Promise<VenueFill[]> { return this.s.portfolio.fills(userId, 200); }
  async price(symbol: string): Promise<number> { return (await this.s.quote.execute(symbol)).price; }
}
