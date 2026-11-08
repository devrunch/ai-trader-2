import { PineTS } from 'pinets';
import { makeBars, COMBO_SCRIPT } from './data.mjs';
const all = makeBars(5100, 3); let visible = 5000, polls = 0;
const provider = { configure() {}, async getSymbolInfo(t) { return { ticker: t, tickerid: t, prefix: 'NSE', currency: 'INR', timezone: 'Asia/Kolkata', mintick: 0.05, type: 'stock', session: '24x7' }; },
  async getMarketData(t, tf, l, sDate) { polls++; globalThis.lf = performance.now(); if (polls > 1) visible++; let r = all.slice(0, visible); if (sDate) r = r.filter(b => b.openTime >= sDate); return r; } };
const p = new PineTS(provider, 'NSE:TEST', '1', 5000);
let n = 0; const t0 = performance.now(); const byPoll = new Map();
const s = p.stream(COMBO_SCRIPT, { live: true, interval: 150, pageSize: 5000 });
s.on("data", (ctx) => { n++; if (n > 2) (globalThis.L ??= []).push(performance.now() - globalThis.lf); byPoll.set(polls, (byPoll.get(polls) ?? 0) + 1);
  if (n === 1) console.log('first event keys', Object.keys(ctx).slice(0, 12), 'at', (performance.now() - t0).toFixed(1), 'ms'); });
setTimeout(() => { s.stop(); const L = (globalThis.L ?? []).sort((a,b)=>a-b); console.log("live update latency median", L[Math.floor(L.length/2)]?.toFixed(2), "ms max", L.at(-1)?.toFixed(2), "ms over", L.length, "updates;", "polls", polls, 'events per poll', JSON.stringify([...byPoll])); process.exit(0); }, 6000);
