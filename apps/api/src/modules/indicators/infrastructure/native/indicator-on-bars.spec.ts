import { describe, expect, it } from 'vitest';
import type { Bar } from '@aitrader/contracts';
import { NativeRuntime } from './native-runtime';
import { IndicatorService } from '../../application/indicator.service';
import { RuntimeResolver } from '../../application/runtime-resolver';

const bars: Bar[] = [1, 2, 3, 4, 5, 4, 3, 4, 5, 6, 7, 6].map((close, i) => ({ time: 1_700_000_000_000 + i * 86_400_000, open: close, high: close + 1, low: close - 1, close, volume: 100 }));
const market = () => { const calls: unknown[] = []; return { calls, bars: (...args: unknown[]) => { calls.push(args); return Promise.resolve({ instrumentId: 'NSE:X', resolvedId: 'NSE:X', interval: '1D' as const, bars, nextBefore: null, status: { state: 'ok' as const } }); } }; };
const service = (m = market()) => ({ m, service: new IndicatorService(m, new RuntimeResolver([new NativeRuntime()]), () => 'UTC') });

describe('IndicatorService.computeOnBars', () => {
  it('computes a hand-checked SMA and EMA on supplied bars without touching market data', async () => {
    const { m, service: s } = service();
    const sma = await s.computeOnBars({ id: 'sma', inputs: { length: 3 } }, bars.slice(0, 5));
    expect(sma.times).toEqual(bars.slice(0, 5).map(b => b.time));
    expect(sma.plots).toEqual([{ id: 'ma', values: [null, null, 2, 3, 4] }]);
    const ema = await s.computeOnBars({ id: 'ema', inputs: { length: 3 } }, bars.slice(0, 5));
    expect(ema.plots).toEqual([{ id: 'ma', values: [null, null, 2, 3, 4] }]);
    expect(m.calls).toEqual([]);
  });

  it('computes RSI 100 on a monotonic rise', async () => {
    const rising = bars.slice(0, 5);
    const rsi = await service().service.computeOnBars({ id: 'rsi', inputs: { length: 3 } }, rising);
    expect(rsi.plots[0]).toEqual({ id: 'rsi', values: [null, null, null, 100, 100] });
  });

  it('equals compute() on the same bars', async () => {
    const { service: s } = service();
    const direct = await s.compute({ symbol: 'NSE:X', interval: '1D', indicator: { kind: 'builtin', id: 'rsi', inputs: { length: 5 } }, range: { limit: bars.length } });
    const onBars = await s.computeOnBars({ id: 'rsi', inputs: { length: 5 } }, bars);
    expect({ times: onBars.times, plots: onBars.plots }).toEqual({ times: direct.times, plots: direct.plots });
  });

  it('rejects an unknown indicator and an out-of-range input, and returns empty plots for no bars', async () => {
    const { service: s } = service();
    await expect(s.computeOnBars({ id: 'nope', inputs: {} }, bars)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(s.computeOnBars({ id: 'sma', inputs: { length: 0 } }, bars)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await s.computeOnBars({ id: 'sma', inputs: {} }, [])).toEqual({ times: [], plots: [{ id: 'ma', values: [] }] });
  });
});
