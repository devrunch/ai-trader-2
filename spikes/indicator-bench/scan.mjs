import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { makeBars, COMBO_SCRIPT, RSI_SCRIPT } from './data.mjs';
if (isMainThread) {
  const SYMBOLS = 2000, BARS = 500;
  for (const [label, engine, script] of [['PineTS combo (6 ind)', 'pine', COMBO_SCRIPT], ['PineTS RSI only', 'pine', RSI_SCRIPT], ['trading-signals RSI+EMA+ATR', 'native', null]]) {
    for (const W of [1, os.cpus().length]) {
      const per = Math.ceil(SYMBOLS / W); const t0 = performance.now();
      await Promise.all(Array.from({ length: W }, (_, w) => new Promise((res, rej) => {
        const wk = new Worker(new URL(import.meta.url), { workerData: { from: w * per, to: Math.min(SYMBOLS, (w + 1) * per), BARS, engine, script } });
        wk.on('message', res); wk.on('error', rej);
      })));
      console.log(`${label.padEnd(30)} ${SYMBOLS} symbols x ${BARS} bars, ${String(W).padStart(2)} workers: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
    }
  }
} else {
  const { from, to, BARS, engine, script } = workerData;
  if (engine === 'pine') {
    const { PineTS } = await import('pinets');
    for (let i = from; i < to; i++) await new PineTS(makeBars(BARS, i + 1), 'NSE:S' + i, '1').run(script);
  } else {
    const { RSI, EMA, ATR } = await import('trading-signals');
    for (let i = from; i < to; i++) { const r = new RSI(14), e = new EMA(20), a = new ATR(14);
      for (const b of makeBars(BARS, i + 1)) { r.add(b.close); e.add(b.close); a.add(b); } }
  }
  parentPort.postMessage('done');
}
