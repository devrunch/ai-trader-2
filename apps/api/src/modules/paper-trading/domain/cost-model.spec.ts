import { describe, expect, it } from 'vitest';
import { chargesFor } from './cost-model';

describe('Indian cost model FR-PT-6', () => {
  it('itemises an NSE intraday buy of 1,00,000', () => {
    expect(chargesFor({ segment: 'equity', product: 'MIS', side: 'buy', exchange: 'NSE', price: 1000, quantity: 100 }))
      .toEqual({ brokerage: 20, stt: 0, exchange: 2.97, sebi: 0.1, stamp: 3, gst: 4.15, total: 30.22 });
  });

  it('itemises the matching NSE intraday sell with STT on the sell side', () => {
    expect(chargesFor({ segment: 'equity', product: 'MIS', side: 'sell', exchange: 'NSE', price: 1010, quantity: 100 }))
      .toEqual({ brokerage: 20, stt: 25.25, exchange: 3, sebi: 0.1, stamp: 0, gst: 4.16, total: 52.51 });
  });

  it('charges 0.03% brokerage when it is under the 20 rupee cap', () => {
    expect(chargesFor({ segment: 'equity', product: 'MIS', side: 'buy', exchange: 'NSE', price: 100, quantity: 10 }).brokerage).toBe(0.3);
  });

  it('charges no brokerage and STT on both sides for delivery', () => {
    expect(chargesFor({ segment: 'equity', product: 'CNC', side: 'buy', exchange: 'NSE', price: 2000, quantity: 10 }))
      .toEqual({ brokerage: 0, stt: 20, exchange: 0.59, sebi: 0.02, stamp: 3, gst: 0.11, total: 23.72 });
    expect(chargesFor({ segment: 'equity', product: 'CNC', side: 'sell', exchange: 'NSE', price: 2000, quantity: 10 }).stt).toBe(20);
  });

  it('uses BSE exchange charges for BSE equity', () => {
    expect(chargesFor({ segment: 'equity', product: 'CNC', side: 'buy', exchange: 'BSE', price: 2000, quantity: 10 }).exchange).toBe(0.75);
  });

  it('itemises a futures sell', () => {
    expect(chargesFor({ segment: 'futures', product: 'NRML', side: 'sell', exchange: 'NFO', price: 2000, quantity: 50 }))
      .toEqual({ brokerage: 20, stt: 20, exchange: 1.73, sebi: 0.1, stamp: 0, gst: 3.93, total: 45.76 });
  });

  it('charges options a flat 20 brokerage and STT on the sold premium', () => {
    const sell = chargesFor({ segment: 'options', product: 'NRML', side: 'sell', exchange: 'NFO', price: 120, quantity: 75 });
    expect(sell).toEqual({ brokerage: 20, stt: 9, exchange: 3.15, sebi: 0.01, stamp: 0, gst: 4.17, total: 36.33 });
    const buy = chargesFor({ segment: 'options', product: 'NRML', side: 'buy', exchange: 'NFO', price: 120, quantity: 75 });
    expect(buy.stt).toBe(0);
    expect(buy.stamp).toBe(0.27);
  });
});
