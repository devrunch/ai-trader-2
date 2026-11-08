// Forming bar: same bar count, last bar's close changes each poll (a live tick). Cost, and is the result right?
import { PineTS } from 'pinets';
import { makeBars, COMBO_SCRIPT, plotValues } from './data.mjs';
const START = Math.floor(Date.now() / 60000) * 60000 - 4999 * 60000;
const base = makeBars(5000, 9, START);
let polls = 0, tick = 0, lf = 0;
const cur = () => { const b = base.slice(); const l = { ...b.at(-1) }; l.close = l.open + Math.sin(tick) * 3; l.high = Math.max(l.high, l.close); l.low = Math.min(l.low, l.close); b[b.length - 1] = l; return b; };
const provider = { configure() {}, async getSymbolInfo(t) { return { ticker: t, tickerid: t, prefix: 'NSE', currency: 'INR', timezone: 'Asia/Kolkata', mintick: 0.05, type: 'stock', session: '24x7' }; },
  async getMarketData(t, tf, l, sDate) { polls++; if (polls > 1 && polls <= 4) tick++; lf = performance.now(); let r = cur(); if (sDate) r = r.filter(b => b.openTime >= sDate); return r; } };
const p = new PineTS(provider, 'NSE:TEST', '1', 5000);
const L = []; let n = 0, lastCtx;
const s = p.stream(COMBO_SCRIPT, { live: true, interval: 120, pageSize: 5000 });
s.on('error', (e) => console.log('error', e?.message ?? e));
s.on('data', (ctx) => { n++; if (n > 2) L.push(performance.now() - lf); lastCtx = ctx; });
setTimeout(async () => {
  s.stop();
  L.sort((a, b) => a - b);
  console.log(`forming-bar updates ${L.length}: median ${L[Math.floor(L.length / 2)]?.toFixed(2)} ms, max ${L.at(-1)?.toFixed(2)} ms`);
  const fresh = await new PineTS(cur(), 'NSE:TEST', '1').run(COMBO_SCRIPT);
  for (const k of ['rsi', 'ema', 'macd', 'bbu', 'st', 'atr']) {
    const live = lastCtx.plots?.[k]?.data, f = plotValues(fresh, k); if (k === "rsi") { const ts = live.map(d => d.time); console.log("rsi live last 5 times", JSON.stringify(ts.slice(-5).map(t => t - ts.at(-1)))); }
    const lv = live?.at(-1)?.value, fv = f.at(-1);
    const points = live?.length;
    console.log(`${k.padEnd(5)} live last ${lv?.toFixed(6)}  fresh full run ${fv?.toFixed(6)}  diff ${Math.abs((lv ?? NaN) - fv).toExponential(2)}  (live points ${points}, fresh ${f.length})`);
  }
  process.exit(0);
}, 9000);
