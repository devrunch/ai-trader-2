import { describe, expect, it } from 'vitest';
import { checkRisk, DEFAULT_RISK_LIMITS, type RiskInput } from './risk';
import { marginRate, usedMargin } from './margin';
import { orderExpiresAt, squareOffAt } from './session-rules';

const input = (patch: Partial<RiskInput> = {}): RiskInput => ({
  side: 'buy', type: 'limit', product: 'MIS', quantity: 10, limitPrice: 100, triggerPrice: null, segment: 'equity',
  marketOpen: true, afterMisCutoff: false, lastPrice: 100, position: 0, openPositions: 0, dayPnl: 0, availableMargin: 1_000_000, ...patch,
});
const reason = (patch: Partial<RiskInput>) => { const result = checkRisk(input(patch), DEFAULT_RISK_LIMITS); return result.ok ? null : result.reason; };

describe('risk gates FR-PT-4 (pure, fail closed)', () => {
  it('passes an ordinary order', () => { expect(checkRisk(input(), DEFAULT_RISK_LIMITS)).toEqual({ ok: true }); });

  it('rejects instruments outside the allowed list and a closed market', () => {
    expect(reason({ segment: null })).toBe('INSTRUMENT_NOT_ALLOWED');
    expect(reason({ marketOpen: false })).toBe('MARKET_CLOSED');
  });

  it('rejects new MIS exposure after the square-off cutoff but lets exits through', () => {
    expect(reason({ afterMisCutoff: true })).toBe('MIS_CUTOFF');
    expect(reason({ afterMisCutoff: true, side: 'sell', position: 10 })).toBeNull();
  });

  it('rejects when there is no price to check against', () => { expect(reason({ lastPrice: null })).toBe('NO_PRICE'); });

  it('rejects limits outside the price band and stops on the wrong side of the price', () => {
    expect(reason({ limitPrice: 121 })).toBe('PRICE_BAND');
    expect(reason({ limitPrice: 79 })).toBe('PRICE_BAND');
    expect(reason({ type: 'stop', limitPrice: null, triggerPrice: 99 })).toBe('TRIGGER_INVALID');
    expect(reason({ type: 'stop', side: 'sell', limitPrice: null, triggerPrice: 101 })).toBe('TRIGGER_INVALID');
    expect(reason({ type: 'stop', limitPrice: null, triggerPrice: 101 })).toBeNull();
  });

  it('caps the order value and the resulting position value', () => {
    expect(reason({ quantity: 5001 })).toBe('MAX_ORDER_VALUE');
    expect(reason({ quantity: 5000, position: 5001 })).toBe('MAX_POSITION_VALUE');
    expect(reason({ side: 'sell', quantity: 9000, position: 9000, type: 'market', limitPrice: null })).toBeNull();
  });

  it('caps the number of open positions for a new instrument only', () => {
    expect(reason({ openPositions: 10 })).toBe('MAX_OPEN_POSITIONS');
    expect(reason({ openPositions: 10, position: 5 })).toBeNull();
  });

  it('blocks new exposure once the daily loss limit is reached', () => {
    expect(reason({ dayPnl: -50_000 })).toBe('DAILY_LOSS_LIMIT');
    expect(reason({ dayPnl: -50_000, side: 'sell', position: 10 })).toBeNull();
  });

  it('refuses delivery short sales and option writing', () => {
    expect(reason({ product: 'CNC', side: 'sell', position: 5 })).toBe('SHORT_DELIVERY');
    expect(reason({ product: 'CNC', side: 'sell', position: 10 })).toBeNull();
    expect(reason({ segment: 'options', product: 'NRML', side: 'sell' })).toBe('OPTION_WRITING');
    expect(reason({ segment: 'options', product: 'NRML', side: 'sell', position: 10 })).toBeNull();
  });

  it('rejects when the margin for the added exposure exceeds what is available', () => {
    expect(reason({ availableMargin: 199 })).toBe('INSUFFICIENT_MARGIN');
    expect(reason({ availableMargin: 200 })).toBeNull();
    expect(reason({ product: 'CNC', availableMargin: 999 })).toBe('INSUFFICIENT_MARGIN');
  });
});

describe('margin', () => {
  it('uses delivery in full, intraday equity at 5x, futures at 15% and option premium in full', () => {
    expect([marginRate('equity', 'CNC'), marginRate('equity', 'MIS'), marginRate('futures', 'NRML'), marginRate('options', 'MIS')]).toEqual([1, 0.2, 0.15, 1]);
  });

  it('blocks margin for open positions and working entry orders', () => {
    expect(usedMargin([{ quantity: -10, averagePrice: 100, segment: 'equity', product: 'MIS' }],
      [{ quantity: 5, price: 200, segment: 'equity', product: 'CNC' }])).toBe(1200);
  });
});

describe('session rules FR-PT-5', () => {
  const session = { open: Date.parse('2026-11-10T03:45:00Z'), close: Date.parse('2026-11-10T10:00:00Z') };
  it('squares off NSE, BSE and NFO intraday positions at 15:20 IST', () => {
    for (const exchange of ['NSE', 'BSE', 'NFO']) expect(new Date(squareOffAt(exchange, session)).toISOString()).toBe('2026-11-10T09:50:00.000Z');
  });
  it('expires MIS orders at the square-off and other day orders at the close', () => {
    expect(orderExpiresAt('MIS', 'NSE', session)).toBe(Date.parse('2026-11-10T09:50:00Z'));
    expect(orderExpiresAt('CNC', 'NSE', session)).toBe(session.close);
  });
});
