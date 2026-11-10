import type { PaperOrderStatus, PaperOrderType, PaperProduct, PaperSide } from '@aitrader/contracts';
import { isTickMultiple } from './money';
import { productAllowed, type Segment } from './segment';

export interface OrderInput {
  side: PaperSide;
  type: PaperOrderType;
  product: PaperProduct;
  quantity: number;
  limitPrice?: number | undefined;
  triggerPrice?: number | undefined;
  stopLoss?: number | undefined;
  target?: number | undefined;
}

export class InvalidOrderError extends Error {
  readonly code = 'VALIDATION_FAILED';
  constructor(message: string, readonly field: string) {
    super(message);
    this.name = 'InvalidOrderError';
  }
}

export class OrderStateError extends Error {
  readonly code = 'CONFLICT';
  constructor(readonly status: PaperOrderStatus) {
    super(`Order is ${status}`);
    this.name = 'OrderStateError';
  }
}

const NEEDS: Record<PaperOrderType, { limit: boolean; trigger: boolean }> = {
  market: { limit: false, trigger: false }, limit: { limit: true, trigger: false },
  stop: { limit: false, trigger: true }, stop_limit: { limit: true, trigger: true },
};

/** Structural checks that don't depend on the market: a failure is a 422, never a stored rejection. */
export function validateOrder(input: OrderInput, instrument: { lotSize: number; tick: number }, segment: Segment): void {
  if (!productAllowed(segment, input.product)) throw new InvalidOrderError(`${input.product} is not available for ${segment}`, 'product');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0 || input.quantity % instrument.lotSize !== 0) {
    throw new InvalidOrderError(`Quantity must be a multiple of the lot size ${String(instrument.lotSize)}`, 'quantity');
  }
  const needs = NEEDS[input.type];
  requirePrice(input.limitPrice, needs.limit, 'limitPrice', input.type);
  requirePrice(input.triggerPrice, needs.trigger, 'triggerPrice', input.type);
  for (const field of ['limitPrice', 'triggerPrice', 'stopLoss', 'target'] as const) {
    const value = input[field];
    if (value !== undefined && !isTickMultiple(value, instrument.tick)) throw new InvalidOrderError(`Price must be a multiple of ${String(instrument.tick)}`, field);
  }
  const buy = input.side === 'buy';
  if (input.type === 'stop_limit' && input.limitPrice !== undefined && input.triggerPrice !== undefined
    && (buy ? input.limitPrice < input.triggerPrice : input.limitPrice > input.triggerPrice)) {
    throw new InvalidOrderError('A stop-limit buy needs limit ≥ trigger; a sell needs limit ≤ trigger', 'limitPrice');
  }
  validateExits(input, buy);
}

function requirePrice(value: number | undefined, needed: boolean, field: string, type: PaperOrderType): void {
  if (needed && value === undefined) throw new InvalidOrderError(`${type} orders need ${field}`, field);
  if (!needed && value !== undefined) throw new InvalidOrderError(`${type} orders take no ${field}`, field);
}

// Stop-loss below and target above the entry for a buy (mirrored for a sell); entry is the limit, else the trigger.
function validateExits(input: OrderInput, buy: boolean): void {
  const entry = input.limitPrice ?? input.triggerPrice;
  const below = (a: number, b: number) => (buy ? a < b : a > b);
  if (input.stopLoss !== undefined && input.target !== undefined && !below(input.stopLoss, input.target)) {
    throw new InvalidOrderError('The stop-loss must be on the losing side of the target', 'stopLoss');
  }
  if (entry === undefined) return;
  if (input.stopLoss !== undefined && !below(input.stopLoss, entry)) throw new InvalidOrderError('The stop-loss must be on the losing side of the entry', 'stopLoss');
  if (input.target !== undefined && !below(entry, input.target)) throw new InvalidOrderError('The target must be on the winning side of the entry', 'target');
}

/** open → filled | cancelled | expired; rejected orders never open. */
export function assertCancellable(status: PaperOrderStatus): void {
  if (status !== 'open') throw new OrderStateError(status);
}
