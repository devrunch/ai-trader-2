// Deterministic synthetic 1m bars (seeded random walk) so every engine sees identical input.
export function makeBars(n, seed = 42, start = 1_730_000_000_000) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const bars = [];
  let price = 1000;
  for (let i = 0; i < n; i++) {
    const open = price;
    const drift = (rnd() - 0.5) * 4;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + rnd() * 2;
    const low = Math.min(open, close) - rnd() * 2;
    const volume = Math.round(1000 + rnd() * 9000);
    const openTime = start + i * 60_000;
    bars.push({ openTime, open, high, low, close, volume, closeTime: openTime + 59_999,
      quoteAssetVolume: 0, numberOfTrades: 0, takerBuyBaseAssetVolume: 0, takerBuyQuoteAssetVolume: 0, ignore: 0 });
    price = close;
  }
  return bars;
}

export const RSI_SCRIPT = `//@version=5
indicator("rsi")
plot(ta.rsi(close, 14), "rsi")`;

export const COMBO_SCRIPT = `//@version=5
indicator("combo")
plot(ta.rsi(close, 14), "rsi")
plot(ta.ema(close, 20), "ema")
[m, s, h] = ta.macd(close, 12, 26, 9)
plot(m, "macd")
[mid, up, lo] = ta.bb(close, 20, 2)
plot(up, "bbu")
[st, dir] = ta.supertrend(3, 10)
plot(st, "st")
plot(ta.atr(14), "atr")`;

export function plotValues(ctx, name) {
  const p = ctx.plots[name];
  if (!p) throw new Error(`no plot ${name}; have ${Object.keys(ctx.plots)}`);
  return p.data.map((d) => (d.value == null || Number.isNaN(d.value) ? null : d.value));
}
