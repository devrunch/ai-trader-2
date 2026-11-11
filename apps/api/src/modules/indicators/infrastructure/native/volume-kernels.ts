import { numberInput } from '../../domain/inputs';
import type { BarKernelFactory } from './bar-kernel';
import { stepper } from './extremes-kernel';
import { RollingWindow } from './kernels';

/** `ta.cum(sign(change(close)) × volume)`; `na` on the first bar, which the total then skips. */
const obv: BarKernelFactory = () => {
  const total = stepper<{ close: number | null; total: number | null }>({ close: null, total: null }, (state, bar) => {
    if (state.close === null) return { close: bar.close, total: null };
    return { close: bar.close, total: (state.total ?? 0) + Math.sign(bar.close - state.close) * (bar.volume ?? 0) };
  });
  return { update: (bar, replace) => ({ obv: total.update(bar, replace).total }) };
};

/** Chaikin Money Flow: money-flow volume over volume across the window; a bar with no range adds 0. */
const cmf: BarKernelFactory = inputs => {
  const length = numberInput(inputs, 'length');
  const flows = new RollingWindow(length);
  const volumes = new RollingWindow(length);
  const total = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);
  return { update(bar, replace) {
    const volume = bar.volume ?? 0;
    const range = bar.high - bar.low;
    const flow = range === 0 ? 0 : (2 * bar.close - bar.low - bar.high) / range * volume;
    const flowWindow = flows.update(flow, replace);
    const volumeWindow = volumes.update(volume, replace);
    if (!flowWindow || !volumeWindow || total(volumeWindow) === 0) return { cmf: null };
    return { cmf: total(flowWindow) / total(volumeWindow) };
  } };
};

export const VOLUME_KERNELS: Record<string, BarKernelFactory> = { obv, cmf };
