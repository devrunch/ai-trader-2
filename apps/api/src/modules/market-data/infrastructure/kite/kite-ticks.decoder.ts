// Offsets adapted from kiteconnect 5.3.0 lib/ticker.js (MIT), Zerodha Technology (2024).
// https://github.com/zerodha/kiteconnectjs ; see kite-ticks.decoder.LICENSE.
interface DepthLevel { quantity: number; price: number; orders: number }
export interface KiteRawTick {
  instrument_token: number;
  tradable: boolean;
  mode: 'ltp' | 'quote' | 'full';
  last_price: number;
  ohlc?: { open: number; high: number; low: number; close: number };
  change?: number;
  last_traded_quantity?: number;
  average_traded_price?: number;
  volume_traded?: number;
  total_buy_quantity?: number;
  total_sell_quantity?: number;
  last_trade_time?: number | null;
  exchange_timestamp?: number | null;
  oi?: number;
  oi_day_high?: number;
  oi_day_low?: number;
  depth?: { buy: DepthLevel[]; sell: DepthLevel[] };
}
const lengths = new Set([8, 28, 32, 44, 184]);
const invalid = () => new Error('INVALID_TICKS');
const timestamp = (view: DataView, offset: number): number | null => view.getUint32(offset) * 1000 || null;

export function decodeKitePackets(buf: ArrayBuffer): KiteRawTick[] {
  if (buf.byteLength === 1) return [];
  if (buf.byteLength < 2) throw invalid();
  const view = new DataView(buf); const ticks: KiteRawTick[] = []; let offset = 2;
  for (let i = 0; i < view.getUint16(0); i++) {
    if (offset + 2 > buf.byteLength) throw invalid();
    const length = view.getUint16(offset); offset += 2;
    if (!lengths.has(length) || offset + length > buf.byteLength) throw invalid();
    ticks.push(decodePacket(new DataView(buf, offset, length))); offset += length;
  }
  if (offset !== buf.byteLength) throw invalid();
  return ticks;
}
function decodePacket(view: DataView): KiteRawTick {
  const token = view.getUint32(0); const segment = token & 0xff;
  const divisor = segment === 3 ? 10000000 : segment === 6 ? 10000 : 100;
  const price = (offset: number) => view.getInt32(offset) / divisor;
  const size = view.byteLength;
  const base: KiteRawTick = { instrument_token: token, tradable: segment !== 9,
    mode: size === 8 ? 'ltp' : size === 32 || size === 184 ? 'full' : 'quote', last_price: price(4) };
  if (size === 8) return base;
  const index = size === 28 || size === 32;
  const ohlc = { open: price(index ? 16 : 28), high: price(index ? 8 : 32), low: price(index ? 12 : 36), close: price(index ? 20 : 40) };
  const tick: KiteRawTick = { ...base, ohlc, change: ohlc.close ? (base.last_price - ohlc.close) * 100 / ohlc.close : index ? view.getInt32(24) : 0 };
  if (index) return size === 32 ? { ...tick, exchange_timestamp: timestamp(view, 28) } : tick;
  const quote: KiteRawTick = { ...tick, last_traded_quantity: view.getUint32(8), average_traded_price: price(12),
    volume_traded: view.getUint32(16), total_buy_quantity: view.getUint32(20), total_sell_quantity: view.getUint32(24) };
  if (size === 44) return quote;
  const depth = Array.from({ length: 10 }, (_, i) => {
    const offset = 64 + i * 12;
    return { quantity: view.getUint32(offset), price: price(offset + 4), orders: view.getUint16(offset + 8) };
  });
  return { ...quote, last_trade_time: timestamp(view, 44), exchange_timestamp: timestamp(view, 60),
    oi: view.getUint32(48), oi_day_high: view.getUint32(52), oi_day_low: view.getUint32(56), depth: { buy: depth.slice(0, 5), sell: depth.slice(5) } };
}
