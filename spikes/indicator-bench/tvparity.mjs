// TradingView's own values (read from tradingview.com, NSE:RELIANCE 1D) vs PineTS and trading-signals on the same bars.
import { readFileSync } from 'node:fs';
import { PineTS } from 'pinets';
import { RSI, ATR, EMA, MACD, BollingerBands } from 'trading-signals';
import { plotValues } from './data.mjs';

const r1 = JSON.parse(readFileSync('tv-r1.json')), r2 = JSON.parse(readFileSync('tv-r2.json')), r3 = JSON.parse(readFileSync('tv-r3.json'));
const raw = r1.bars;
const bars = raw.map(([t, o, h, l, c, v]) => ({ openTime: t * 1000, open: o, high: h, low: l, close: c, volume: v ?? 0, closeTime: t * 1000 + 86_399_999,
  quoteAssetVolume: 0, numberOfTrades: 0, takerBuyBaseAssetVolume: 0, takerBuyQuoteAssetVolume: 0, ignore: 0 }));
const times = raw.map((b) => b[0]);
const tv = {};
const byTime = (rows, col) => { const m = new Map(rows.map((r) => [r[0], r[col]])); return times.map((t) => m.get(t) ?? null); };
const find = (d, prefix) => d.studies[Object.keys(d.studies).find((k) => k.startsWith(prefix))];
tv.rsi = byTime(find(r1, 'RSI'), 1);
tv.atr = byTime(find(r1, 'ATR'), 1);
const macd = find(r2, 'MACD'); tv.macd = byTime(macd, 2); tv.signal = byTime(macd, 3); tv.hist = byTime(macd, 1);
const bb = find(r2, 'BB'); tv.bbBasis = byTime(bb, 1); tv.bbUpper = byTime(bb, 2); tv.bbLower = byTime(bb, 3);
tv.ema = byTime(find(r3, 'EMA'), 1);

const script = `//@version=6
indicator("tvparity")
plot(ta.rsi(close, 14), "rsi")
plot(ta.atr(14), "atr")
[m, s, h] = ta.macd(close, 12, 26, 9)
plot(m, "macd")
plot(s, "signal")
plot(h, "hist")
[b, u, l] = ta.bb(close, 20, 2)
plot(b, "bbBasis")
plot(u, "bbUpper")
plot(l, "bbLower")
plot(ta.ema(close, 20), "ema")`;
const ctx = await new PineTS(bars.slice(), 'NSE:RELIANCE', 'D').run(script);
const pine = Object.fromEntries(Object.keys(tv).map((k) => [k, plotValues(ctx, k)]));

const ts = { rsi: [], atr: [], ema: [], macd: [], signal: [], hist: [], bbBasis: [], bbUpper: [], bbLower: [] };
const rsi = new RSI(14), atr = new ATR(14), ema = new EMA(20), mac = new MACD(new EMA(12), new EMA(26), new EMA(9)), bbs = new BollingerBands(20, 2);
for (const b of bars) {
  ts.rsi.push(rsi.add(b.close)); ts.atr.push(atr.add({ high: b.high, low: b.low, close: b.close })); ts.ema.push(ema.add(b.close));
  const m = mac.add(b.close); ts.macd.push(m?.macd ?? null); ts.signal.push(m?.signal ?? null); ts.hist.push(m?.histogram ?? null);
  const x = bbs.add(b.close); ts.bbBasis.push(x?.middle ?? null); ts.bbUpper.push(x?.upper ?? null); ts.bbLower.push(x?.lower ?? null);
}

const SKIP = 300; // TradingView computed from 2020; our input starts Apr 2023, so infinite-memory indicators need warm-up
const cmp = (a, b, from) => { let max = 0, n = 0, rel = 0;
  for (let i = from; i < a.length; i++) if (a[i] != null && b[i] != null && Number.isFinite(a[i]) && Number.isFinite(b[i])) {
    const d = Math.abs(a[i] - b[i]); max = Math.max(max, d); rel = Math.max(rel, d / Math.max(1e-9, Math.abs(b[i]))); n++; }
  return `max ${max.toExponential(2)} (rel ${rel.toExponential(1)}) over ${n}`; };
console.log(`NSE:RELIANCE 1D, ${bars.length} bars ${new Date(bars[0].openTime).toISOString().slice(0, 10)} → ${new Date(bars.at(-1).openTime).toISOString().slice(0, 10)}; compared from bar ${SKIP}`);
console.log('indicator  | PineTS vs TradingView                      | trading-signals vs TradingView');
for (const k of Object.keys(tv)) console.log(`${k.padEnd(10)} | ${cmp(pine[k], tv[k], SKIP).padEnd(42)} | ${cmp(ts[k], tv[k], SKIP)}`);
console.log('windowed indicators (no warm-up effect), all bars:');
for (const k of ['bbBasis', 'bbUpper', 'bbLower']) console.log(`${k.padEnd(10)} | ${cmp(pine[k], tv[k], 0).padEnd(42)} | ${cmp(ts[k], tv[k], 0)}`);
