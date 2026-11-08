// Push-driven: provider resolves when a tick arrives. Throttle patched out. Every tick must produce a correct update.
import { PineTS } from 'pinets';
import { makeBars, COMBO_SCRIPT, plotValues } from './data.mjs';
const RATE = Number(process.argv[2] ?? 10), TICKS = Number(process.argv[3] ?? 60);
const START = Math.floor(Date.now() / 60000) * 60000 - 4999 * 60000;
const bars = makeBars(5000, 9, START);
let waiter = null, pushedAt = 0, seq = 0, served = 0;
const snapshot = () => bars.map((b) => ({ ...b }));
const provider = { configure() {}, async getSymbolInfo(t) { return { ticker: t, tickerid: t, prefix: 'NSE', currency: 'INR', timezone: 'Asia/Kolkata', mintick: 0.05, type: 'stock', session: '24x7' }; },
  async getMarketData(t, tf, l, sDate) {
    if (sDate) { await new Promise((r) => (waiter = r)); served = seq; return snapshot().filter((b) => b.openTime >= sDate); }
    return snapshot();
  } };
const p = new PineTS(provider, 'NSE:TEST', '1', 5000);
const lat = []; let n = 0, last, lastServed = -1;
const s = p.stream(COMBO_SCRIPT, { live: true, interval: 0, pageSize: 5000 });
s.on('error', (e) => console.log('error', e?.message ?? e));
s.on("data", (ctx) => { n++; last = ctx; for (const k of Object.keys(ctx.plots)) { const d = ctx.plots[k].data; if (!Array.isArray(d)) continue; while (d.length > 1 && d.at(-1).time === d.at(-2).time) d.splice(d.length - 2, 1); } if (n > 1 && served !== lastServed) { lat.push(performance.now() - pushedAt); lastServed = served; } });
await new Promise((r) => setTimeout(r, 1500));
let pushed = 0;
const timer = setInterval(() => {
  const b = bars.at(-1); b.close = b.open + Math.sin(++seq) * 3; b.high = Math.max(b.high, b.close); b.low = Math.min(b.low, b.close);
  pushedAt = performance.now(); pushed++; const w = waiter; waiter = null; w?.();
  if (pushed >= TICKS) { clearInterval(timer); setTimeout(finish, 500); }
}, 1000 / RATE);
async function finish() {
  s.stop();
  lat.sort((a, b) => a - b);
  const q = (x) => lat[Math.min(lat.length - 1, Math.floor(lat.length * x))].toFixed(2);
  console.log(`rate ${RATE}/s: ticks pushed ${pushed}, updates computed ${lat.length}, latency p50 ${q(0.5)} ms p95 ${q(0.95)} ms max ${lat.at(-1).toFixed(2)} ms`);
  const fresh = await new PineTS(snapshot(), 'NSE:TEST', '1').run(COMBO_SCRIPT);
  let worst = 0;
  for (const k of ['rsi', 'ema', 'macd', 'bbu', 'st', 'atr']) worst = Math.max(worst, Math.abs(last.plots[k].data.at(-1).value - plotValues(fresh, k).at(-1)));
  console.log(`final values vs fresh full run: worst diff ${worst.toExponential(2)}; rsi points ${last.plots.rsi.data.length} (5000 bars)`);
  process.exit(0);
}
