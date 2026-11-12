import type { PaperPlaceOrderRequest } from '@aitrader/contracts';
import { UnavailableError } from '../../../shared/errors';
import { assertExecutionMode, chooseVenueKind, type ExecutionMode, type VenueKind } from '../domain/venue';

export interface VenueOrder {
  id: string; instrumentId: string; currency: string; side: 'buy' | 'sell'; quantity: number; clientOrderId: string; status: string; placedAt: number;
  limitPrice: number | null; fillPrice: number | null; stopLoss: number | null;
}
export interface VenuePosition { instrumentId: string; product: string; quantity: number; unrealisedPnl: number | null }
export interface VenueFill { orderId: string; realisedPnl: number }

/** Where the assistant's orders go. Paper today; a real broker only through `BrokerVenue`, which is a stub until the owner asks for it. */
export interface ExecutionVenue {
  readonly kind: VenueKind;
  place(userId: string, request: PaperPlaceOrderRequest): Promise<unknown>;
  cancel(userId: string, orderId: string): Promise<unknown>;
  positions(userId: string): Promise<VenuePosition[]>;
  /** Starting cash and currency of the account this symbol settles in. */
  account(userId: string, symbol: string): Promise<{ initialCash: number; currency: string }>;
  orders(userId: string): Promise<VenueOrder[]>;
  fills(userId: string): Promise<VenueFill[]>;
  price(symbol: string): Promise<number>;
}

/** Not wired to anything: every call refuses. It holds the seat for a future Kite venue and has no broker, session or token access. */
export class BrokerVenue implements ExecutionVenue {
  readonly kind = 'broker' as const;
  private refuse(): Promise<never> { return Promise.reject(new UnavailableError('Broker execution is not implemented', { reason: 'BROKER_NOT_IMPLEMENTED' })); }
  place(): Promise<never> { return this.refuse(); }
  cancel(): Promise<never> { return this.refuse(); }
  positions(): Promise<never> { return this.refuse(); }
  account(): Promise<never> { return this.refuse(); }
  orders(): Promise<never> { return this.refuse(); }
  fills(): Promise<never> { return this.refuse(); }
  price(): Promise<never> { return this.refuse(); }
}

/** The per-user setting, off unless the user turned it on. */
export interface BrokerOptIn { enabled(userId: string): Promise<boolean> }

/** Picks the venue for a user: paper unless broker mode, a development environment and the user's opt-in all hold. */
export class VenueRouter {
  constructor(private readonly paper: ExecutionVenue, private readonly broker: ExecutionVenue, private readonly optIn: BrokerOptIn,
    private readonly config: { mode: ExecutionMode; nodeEnv: string }) {
    assertExecutionMode(config.mode, config.nodeEnv);
  }

  async forUser(userId: string): Promise<ExecutionVenue> {
    const optedIn = this.config.mode === 'broker' && this.config.nodeEnv !== 'production' && await this.optIn.enabled(userId);
    return chooseVenueKind({ ...this.config, optedIn }) === 'broker' ? this.broker : this.paper;
  }

  /** The venue as one object the tools call; each call goes to the caller's own venue. */
  routed(): Omit<ExecutionVenue, 'kind'> {
    const via = <T>(userId: string, use: (v: ExecutionVenue) => Promise<T>): Promise<T> => this.forUser(userId).then(use);
    return {
      place: (u, r) => via(u, v => v.place(u, r)), cancel: (u, id) => via(u, v => v.cancel(u, id)), positions: u => via(u, v => v.positions(u)),
      account: (u, s) => via(u, v => v.account(u, s)), orders: u => via(u, v => v.orders(u)), fills: u => via(u, v => v.fills(u)),
      price: symbol => this.paper.price(symbol),
    };
  }
}
