// Does request.security reach the provider with the symbol and timeframe the script asked for?
import { PineTS } from 'pinets';
import { makeBars, plotValues } from './data.mjs';

const calls = [];
const chart = makeBars(3000, 1);
const other = makeBars(3000, 7).map((b) => ({ ...b, open: b.open + 5000, high: b.high + 5000, low: b.low + 5000, close: b.close + 5000 }));

const provider = {
  configure() {},
  async getSymbolInfo(tickerId) {
    return { ticker: tickerId, tickerid: tickerId, prefix: tickerId.split(':')[0], currency: 'INR', timezone: 'Asia/Kolkata', mintick: 0.05, pricescale: 20, minmove: 1, type: 'stock', session: '24x7' };
  },
  async getMarketData(tickerId, timeframe, limit, sDate, eDate) {
    calls.push({ tickerId, timeframe, limit, sDate, eDate });
    const src = tickerId.includes('NIFTY') ? other : chart;
    if (timeframe === '1' || timeframe === '1m') return src;
    const step = { '5': 5, '15': 15, '60': 60, 'D': 375, '1D': 375 }[timeframe] ?? 1;
    const out = [];
    for (let i = 0; i < src.length; i += step) {
      const g = src.slice(i, i + step);
      out.push({ ...g[0], high: Math.max(...g.map((x) => x.high)), low: Math.min(...g.map((x) => x.low)),
        close: g.at(-1).close, closeTime: g.at(-1).closeTime, volume: g.reduce((s, x) => s + x.volume, 0) });
    }
    return out;
  },
};

const script = `//@version=5
indicator("mtf")
plot(close, "chart_close")
plot(request.security("NSE:NIFTY", "1", close), "other_symbol_close")
plot(request.security(syminfo.tickerid, "15", close), "htf_close")`;

const ctx = await new PineTS(provider, 'NSE:RELIANCE', '1', 3000).run(script);
const c = plotValues(ctx, 'chart_close'), o = plotValues(ctx, 'other_symbol_close'), h = plotValues(ctx, 'htf_close');
console.log('provider calls:', JSON.stringify(calls.map(({ tickerId, timeframe }) => ({ tickerId, timeframe }))));
console.log('last chart close', c.at(-1)?.toFixed(2), '| other symbol (expect ~+5000)', o.at(-1)?.toFixed(2), '| 15m close', h.at(-1)?.toFixed(2));
const changes = h.filter((v, i) => i > 0 && v !== h[i - 1]).length;
console.log(`15m series changes ${changes} times over ${h.length} 1m bars (expect ~${Math.round(h.length / 15)} if it only updates on 15m closes)`);
