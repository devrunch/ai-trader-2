import { describe, expect, it } from 'vitest';
import { decodeKitePackets } from './kite-ticks.decoder';
import { encodeKitePackets, kitePacket } from '../../../../../test/support/kite-packets';

describe('FR-MD-2 E11 Kite binary packets', () => {
  it('decodes ltp, quote, full and index packets', () => {
    const ltp = kitePacket(8, 257, [[4, 12345]]);
    const quote = kitePacket(44, 513, [[4, 1100], [8, 2], [12, 1050], [16, 3000000000], [20, 50], [24, 60], [28, 900], [32, 1200], [36, 800], [40, 1000]]);
    const full = kitePacket(184, 769, [[4, 1200], [44, 1800000000], [48, 7], [52, 9], [56, 4], [60, 1800000001], [64, 99], [68, 1150], [124, 80], [128, 1250]]);
    full.writeUInt16BE(3, 72); full.writeUInt16BE(5, 132);
    const indexQuote = kitePacket(28, 1033, [[4, 2100000], [8, 2200000], [12, 1900000], [16, 1950000], [20, 2000000], [24, 42]]);
    const indexFull = kitePacket(32, 1289, [[4, 10000], [28, 1800000002]]);
    const ticks = decodeKitePackets(encodeKitePackets([ltp, quote, full, indexQuote, indexFull]));
    expect(ticks[0]).toEqual({ instrument_token: 257, tradable: true, mode: 'ltp', last_price: 123.45 });
    expect(ticks[1]).toEqual({ instrument_token: 513, tradable: true, mode: 'quote', last_price: 11,
      last_traded_quantity: 2, average_traded_price: 10.5, volume_traded: 3000000000, total_buy_quantity: 50, total_sell_quantity: 60,
      ohlc: { open: 9, high: 12, low: 8, close: 10 }, change: 10 });
    expect(ticks[2]).toMatchObject({ mode: 'full', last_price: 12, last_trade_time: 1800000000000, exchange_timestamp: 1800000001000, oi: 7, oi_day_high: 9, oi_day_low: 4 });
    expect(ticks[2]?.depth?.buy).toHaveLength(5); expect(ticks[2]?.depth?.sell).toHaveLength(5);
    expect(ticks[2]?.depth?.buy[0]).toEqual({ quantity: 99, price: 11.5, orders: 3 });
    expect(ticks[2]?.depth?.sell[0]).toEqual({ quantity: 80, price: 12.5, orders: 5 });
    expect(ticks[3]).toEqual({ instrument_token: 1033, tradable: false, mode: 'quote', last_price: 21000,
      ohlc: { open: 19500, high: 22000, low: 19000, close: 20000 }, change: 5 });
    expect(ticks[4]).toMatchObject({ instrument_token: 1289, tradable: false, mode: 'full', exchange_timestamp: 1800000002000 });
    expect(decodeKitePackets(Uint8Array.of(0).buffer)).toEqual([]);
  });
  it('scales signed prices for CDS and BCD by the token segment', () => {
    const ticks = decodeKitePackets(encodeKitePackets([kitePacket(8, 259, [[4, -123456789]]), kitePacket(44, 262, [[4, 123456], [12, 120000]])]));
    expect(ticks[0]?.last_price).toBe(-12.3456789);
    expect(ticks[1]?.last_price).toBe(12.3456); expect(ticks[1]?.average_traded_price).toBe(12);
  });
  it('returns null for zero exchange and trade timestamps', () => {
    const ticks = decodeKitePackets(encodeKitePackets([kitePacket(184, 257, []), kitePacket(32, 265, [])]));
    expect(ticks[0]?.exchange_timestamp).toBeNull(); expect(ticks[0]?.last_trade_time).toBeNull(); expect(ticks[1]?.exchange_timestamp).toBeNull();
  });
  it('rejects truncated, unsupported and trailing packet bytes visibly', () => {
    for (const buf of [new ArrayBuffer(0), Uint8Array.of(0, 1).buffer, Uint8Array.of(0, 1, 0, 8).buffer,
      encodeKitePackets([kitePacket(12, 257, [])]), Uint8Array.of(0, 0, 0).buffer]) {
      expect(() => decodeKitePackets(buf)).toThrow('INVALID_TICKS');
    }
  });
});
