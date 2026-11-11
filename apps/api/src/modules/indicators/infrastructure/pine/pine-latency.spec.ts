import { afterEach, expect, it } from 'vitest';
import type { Bar } from '@aitrader/contracts';
import { fixtureBars } from '../native/bars.spec-helper';
import { pineHarness, type PineHarness } from './pine.spec-helper';

const COMBO = `//@version=5
indicator("combo")
r = ta.rsi(close, 14)
e = ta.ema(close, 20)
[m, signal, hist] = ta.macd(close, 12, 26, 9)
[mid, upper, lower] = ta.bb(close, 20, 2)
[st, dir] = ta.supertrend(3, 10)
a = ta.atr(14)
plot(r, "rsi")
plot(e, "ema")
plot(m, "macd")
plot(upper, "bbu")
plot(st, "st")
plot(a, "atr")`;

let harness: PineHarness | undefined;
afterEach(() => { harness?.pool.close(); harness = undefined; });

// FR-IN-30: p95 tick-to-value <= 10 ms for a script of 6 indicators; FR-IN-6: ticks reuse saved state.
it('Pine ticks p95 within 10 ms for 6 indicators on 5,000 bars', async () => {
  const history = fixtureBars(5000, 3, 60_000);
  harness = await pineHarness(history);
  const { result, stream } = await harness.service.open({ symbol: 'NSE:X', interval: '1', indicator: { kind: 'pine', source: COMBO, inputs: {} }, range: { limit: 4500 } });
  expect(result.times).toHaveLength(4500);
  expect(result.plots.map(p => p.id)).toEqual(['rsi', 'ema', 'macd', 'bbu', 'st', 'atr']);
  const last = history.at(-1) as Bar;
  const samples: number[] = [];
  for (let tick = 0; tick < 320; tick++) {
    const started = performance.now();
    const point = await stream.push({ ...last, close: last.close + Math.sin(tick) * 3 });
    if (tick >= 20) samples.push(performance.now() - started);
    expect(Object.keys(point?.values ?? {})).toHaveLength(6);
  }
  stream.close();
  samples.sort((a, b) => a - b);
  expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThanOrEqual(10);
});
