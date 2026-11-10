import type { PaperCharges, PaperProduct, PaperSide } from '@aitrader/contracts';
import { roundMoney } from './money';
import type { Segment } from './segment';

/**
 * Charges per executed order, as a Zerodha retail account pays them. Rates are fractions of turnover
 * (price × quantity; premium turnover for options).
 *
 * Sources (rates as published for 2024-10-01 onward; re-check against a current contract note before relying on them):
 * - Brokerage: zerodha.com/charges (equity delivery free; intraday and futures 0.03% capped at ₹20; options flat ₹20).
 * - STT: Union Budget 2026 (Finance Act 2026), effective 2026-04-01: futures 0.05% sell (was 0.02%), options 0.15% of
 *   premium sell (was 0.1%); delivery 0.1% both sides and intraday 0.025% sell unchanged. Exercised options are out of scope.
 * - Exchange transaction charges: the uniform per-exchange rates NSE and BSE adopted on 2024-10-01 under SEBI's
 *   true-to-label rule, as listed on zerodha.com/charges (NSE cash 0.00297%, futures 0.00173%, options 0.03503%;
 *   BSE cash 0.00375%, options 0.0325%, futures 0).
 * - SEBI turnover fee: ₹10 per crore (0.0001%).
 * - Stamp duty: Indian Stamp Act as amended 2020-07-01, buy side only (delivery 0.015%, intraday 0.003%,
 *   futures 0.002%, options 0.003%).
 * - GST: 18% on brokerage, exchange charges and the SEBI fee.
 * Not modelled: DP charges on delivery sells, the NSE IPFT charge, and STT on exercise.
 */
const CHARGE_RATES = {
  brokerageRate: 0.0003,
  brokerageCap: 20,
  optionsBrokerage: 20,
  stt: {
    equityDelivery: { buy: 0.001, sell: 0.001 },
    equityIntraday: { buy: 0, sell: 0.00025 },
    futures: { buy: 0, sell: 0.0005 },
    options: { buy: 0, sell: 0.0015 },
  },
  exchange: {
    NSE: { equity: 0.0000297, futures: 0.0000173, options: 0.0003503 },
    BSE: { equity: 0.0000375, futures: 0, options: 0.000325 },
  },
  sebi: 0.000001,
  stamp: { equityDelivery: 0.00015, equityIntraday: 0.00003, futures: 0.00002, options: 0.00003 },
  gst: 0.18,
} as const;

export interface ChargeInput {
  segment: Segment;
  product: PaperProduct;
  side: PaperSide;
  /** The instrument's exchange; anything but BSE pays NSE rates (NFO is NSE's derivatives segment). */
  exchange: string;
  price: number;
  quantity: number;
}

type RateKey = 'equityDelivery' | 'equityIntraday' | 'futures' | 'options';

function rateKey(segment: Segment, product: PaperProduct): RateKey {
  if (segment === 'equity') return product === 'CNC' ? 'equityDelivery' : 'equityIntraday';
  return segment;
}

export function chargesFor(input: ChargeInput): PaperCharges {
  const turnover = input.price * input.quantity;
  const key = rateKey(input.segment, input.product);
  const brokerage = roundMoney(key === 'equityDelivery' ? 0
    : key === 'options' ? CHARGE_RATES.optionsBrokerage
      : Math.min(CHARGE_RATES.brokerageCap, turnover * CHARGE_RATES.brokerageRate));
  const stt = roundMoney(turnover * CHARGE_RATES.stt[key][input.side]);
  const venue = input.exchange === 'BSE' ? CHARGE_RATES.exchange.BSE : CHARGE_RATES.exchange.NSE;
  const exchange = roundMoney(turnover * venue[input.segment]);
  const sebi = roundMoney(turnover * CHARGE_RATES.sebi);
  const stamp = input.side === 'buy' ? roundMoney(turnover * CHARGE_RATES.stamp[key]) : 0;
  const gst = roundMoney((brokerage + exchange + sebi) * CHARGE_RATES.gst);
  return { brokerage, stt, exchange, sebi, stamp, gst, total: roundMoney(brokerage + stt + exchange + sebi + stamp + gst) };
}
