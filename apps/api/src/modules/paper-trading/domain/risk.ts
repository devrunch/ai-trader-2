import type { PaperOrderType, PaperProduct, PaperRejectReason, PaperSide } from '@aitrader/contracts';
import { marginRate } from './margin';
import { exposureIncrease } from './position';
import type { Segment } from './segment';

export interface RiskLimits {
  maxOrderValue: number;
  maxPositionValue: number;
  maxOpenPositions: number;
  /** Realised P&L net of charges for the day; at or below minus this, new exposure is refused. */
  maxDailyLoss: number;
  /** Limit and trigger prices must lie within this fraction of the last price. */
  priceBand: number;
}

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxOrderValue: 500_000, maxPositionValue: 1_000_000, maxOpenPositions: 10, maxDailyLoss: 50_000, priceBand: 0.2,
};

export interface RiskInput {
  side: PaperSide;
  type: PaperOrderType;
  product: PaperProduct;
  quantity: number;
  limitPrice: number | null;
  triggerPrice: number | null;
  /** null when the instrument is not tradable on paper. */
  segment: Segment | null;
  marketOpen: boolean;
  afterMisCutoff: boolean;
  lastPrice: number | null;
  /** Signed quantity already held in this instrument and product. */
  position: number;
  /** Positions with non-zero quantity across the account. */
  openPositions: number;
  dayPnl: number;
  availableMargin: number;
}

export type RiskResult = { ok: true } | { ok: false; reason: PaperRejectReason };

const reject = (reason: PaperRejectReason): RiskResult => ({ ok: false, reason });

/** Pure gates in a fixed order; anything that can't be decided rejects (FR-PT-4). Exits are only checked for price sanity. */
export function checkRisk(input: RiskInput, limits: RiskLimits): RiskResult {
  if (input.segment === null) return reject('INSTRUMENT_NOT_ALLOWED');
  if (!input.marketOpen) return reject('MARKET_CLOSED');
  if (input.lastPrice === null) return reject('NO_PRICE');
  const priced = priceCheck(input, input.lastPrice, limits.priceBand);
  if (priced) return reject(priced);
  if (input.product === 'CNC' && input.side === 'sell' && input.quantity > input.position) return reject('SHORT_DELIVERY');
  const increase = exposureIncrease(input.position, input.side, input.quantity);
  if (increase === 0) return { ok: true };
  if (input.product === 'MIS' && input.afterMisCutoff) return reject('MIS_CUTOFF');
  const price = input.limitPrice ?? input.triggerPrice ?? input.lastPrice;
  if (increase * price > limits.maxOrderValue) return reject('MAX_ORDER_VALUE');
  const after = Math.abs(input.position + (input.side === 'buy' ? input.quantity : -input.quantity));
  if (after * price > limits.maxPositionValue) return reject('MAX_POSITION_VALUE');
  if (input.position === 0 && input.openPositions >= limits.maxOpenPositions) return reject('MAX_OPEN_POSITIONS');
  if (input.dayPnl <= -limits.maxDailyLoss) return reject('DAILY_LOSS_LIMIT');
  if (input.segment === 'options' && input.side === 'sell') return reject('OPTION_WRITING');
  if (increase * price * marginRate(input.segment, input.product) > input.availableMargin) return reject('INSUFFICIENT_MARGIN');
  return { ok: true };
}

function priceCheck(input: RiskInput, last: number, band: number): PaperRejectReason | null {
  const outside = (value: number) => value > last * (1 + band) || value < last * (1 - band);
  if ((input.limitPrice !== null && outside(input.limitPrice)) || (input.triggerPrice !== null && outside(input.triggerPrice))) return 'PRICE_BAND';
  if (input.triggerPrice !== null && (input.side === 'buy' ? input.triggerPrice <= last : input.triggerPrice >= last)) return 'TRIGGER_INVALID';
  return null;
}
