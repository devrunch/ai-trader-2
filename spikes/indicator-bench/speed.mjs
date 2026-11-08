import { PineTS } from 'pinets';
import { RSI, EMA } from 'trading-signals';
import { makeBars, RSI_SCRIPT, COMBO_SCRIPT, plotValues } from './data.mjs';

const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
const now = () => process.hrtime.bigint();

async function pineRun(bars, code) {
  const p = new PineTS(bars.slice(), 'TEST', '1');
  return p.run(code);
}

async function timeIt(label, fn, reps) {
  const t = [];
  for (let i = 0; i < reps; i++) { const t0 = now(); await fn(); t.push(ms(t0)); }
  t.sort((a, b) => a - b);
  const med = t[Math.floor(t.length / 2)];
  console.log(`${label.padEnd(44)} first ${t0fmt(t)}  median ${med.toFixed(2)} ms  min ${t[0].toFixed(2)} ms`);
  return med;
}
const firsts = new Map();
function t0fmt() { return ''; }

const out = {};
for (const n of [500, 5000, 20000]) {
  const bars = makeBars(n);
  // cold = first run in a fresh process for this script; measured once below
  out[`rsi_${n}`] = await timeIt(`PineTS RSI(14), ${n} bars`, () => pineRun(bars, RSI_SCRIPT), 7);
  out[`combo_${n}`] = await timeIt(`PineTS combo (6 indicators), ${n} bars`, () => pineRun(bars, COMBO_SCRIPT), 5);
  out[`ts_rsi_${n}`] = await timeIt(`trading-signals RSI(14), ${n} bars`, () => {
    const r = new RSI(14); for (const b of bars) r.add(b.close);
  }, 7);
  out[`ts_combo_${n}`] = await timeIt(`trading-signals RSI+EMA, ${n} bars`, () => {
    const r = new RSI(14), e = new EMA(20); for (const b of bars) { r.add(b.close); e.add(b.close); }
  }, 7);
}

// Forming-bar update: what does one new tick cost?
{
  const bars = makeBars(5000);
  const p = new PineTS(bars.slice(), 'TEST', '1');
  await p.run(COMBO_SCRIPT);
  const t0 = now(); await p.run(COMBO_SCRIPT); const rerun = ms(t0);
  console.log(`PineTS combo re-run same instance, 5000 bars       ${rerun.toFixed(2)} ms`);
  const r = new RSI(14); for (const b of bars) r.add(b.close);
  const t1 = now(); for (let i = 0; i < 1000; i++) r.replace(bars.at(-1).close + i * 0.01); const rep = ms(t1) / 1000;
  console.log(`trading-signals RSI replace (forming bar), per tick  ${(rep * 1000).toFixed(2)} µs`);
}
console.log(JSON.stringify(out));
