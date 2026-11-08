import { writeFileSync } from 'node:fs';
import { PineTS } from 'pinets';
import { RSI, EMA, ATR } from 'trading-signals';
import { makeBars, COMBO_SCRIPT, plotValues } from './data.mjs';

const bars = makeBars(2000);
writeFileSync('bars.csv', 'time,open,high,low,close,volume\n' +
  bars.map((b) => [b.openTime, b.open, b.high, b.low, b.close, b.volume].join(',')).join('\n'));

const ctx = await new PineTS(bars.slice(), 'TEST', '1').run(COMBO_SCRIPT);
const pine = { rsi: plotValues(ctx, 'rsi'), ema: plotValues(ctx, 'ema'), atr: plotValues(ctx, 'atr'),
  macd: plotValues(ctx, 'macd'), bbu: plotValues(ctx, 'bbu'), st: plotValues(ctx, 'st') };

const r = new RSI(14), e = new EMA(20), a = new ATR(14);
const ts = { rsi: [], ema: [], atr: [] };
for (const b of bars) {
  ts.rsi.push(r.add(b.close)); ts.ema.push(e.add(b.close));
  ts.atr.push(a.add({ high: b.high, low: b.low, close: b.close }));
}
writeFileSync('engine-values.json', JSON.stringify({ pine, ts }));

const diff = (x, y, from) => {
  let max = 0, n = 0;
  for (let i = from; i < x.length; i++) if (x[i] != null && y[i] != null) { max = Math.max(max, Math.abs(x[i] - y[i])); n++; }
  return { maxAbsDiff: max, compared: n };
};
for (const k of ['rsi', 'ema', 'atr']) {
  console.log(`PineTS vs trading-signals ${k}: all bars`, diff(pine[k], ts[k], 0), ' after warm-up(300)', diff(pine[k], ts[k], 300));
}
