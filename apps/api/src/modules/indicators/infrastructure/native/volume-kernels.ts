import type { Bar } from '@aitrader/contracts';
import { numberInput, type ResolvedInputs } from '../../domain/inputs';
import { minus, type BarKernel, type BarKernelFactory } from './bar-kernel';
import { stepper } from './extremes-kernel';
import { RollingWindow, changeKernel, emaKernel, gated, sumOf, windowKernel } from './kernels';

/** `ta.cum` of a per-bar term; a bar whose term is `na` adds nothing, and the total is `na` until a term exists. */
function cumulative(id: string, term: (bar: Bar, before: Bar | null) => number | null): BarKernel {
  const running = stepper<{ bar: Bar | null; total: number | null }>({ bar: null, total: null }, (state, bar) => {
    const value = term(bar, state.bar);
    return { bar, total: value === null ? state.total : (state.total ?? 0) + value };
  });
  return { update: (bar, replace) => ({ [id]: running.update(bar, replace).total }) };
}

/** Money-flow volume: where the close sits in the bar's range times volume; a bar with no range adds 0. */
const moneyFlow = (bar: Bar): number => (bar.high === bar.low ? 0 : (2 * bar.close - bar.low - bar.high) / (bar.high - bar.low) * (bar.volume ?? 0));

const obv: BarKernelFactory = () => cumulative('obv', (bar, before) => (before ? Math.sign(bar.close - before.close) * (bar.volume ?? 0) : null));
const accumulationDistribution: BarKernelFactory = () => cumulative('ad', moneyFlow);
const priceVolumeTrend: BarKernelFactory = () => cumulative('pvt', (bar, before) => (before ? (bar.close - before.close) / before.close * (bar.volume ?? 0) : null));

/** Chaikin Money Flow: money-flow volume over volume across the window; a bar with no range adds 0. */
const cmf: BarKernelFactory = inputs => {
  const length = numberInput(inputs, 'length');
  const flows = new RollingWindow(length);
  const volumes = new RollingWindow(length);
  return { update(bar, replace) {
    const volume = bar.volume ?? 0;
    const flow = moneyFlow(bar);
    const flowWindow = flows.update(flow, replace);
    const volumeWindow = volumes.update(volume, replace);
    if (!flowWindow || !volumeWindow || sumOf(volumeWindow) === 0) return { cmf: null };
    return { cmf: sumOf(flowWindow) / sumOf(volumeWindow) };
  } };
};

function chaikinOscillator(inputs: ResolvedInputs): BarKernel {
  const line = cumulative('ad', moneyFlow);
  const fast = emaKernel(numberInput(inputs, 'fast'));
  const slow = emaKernel(numberInput(inputs, 'slow'));
  return { update(bar, replace) {
    const total = line.update(bar, replace).ad ?? null;
    return { osc: total === null ? null : minus(fast.update(total, replace), slow.update(total, replace)) };
  } };
}

/** Ease of Movement: SMA of distance moved per unit of volume; a zero-volume bar makes its window `na`. */
const easeOfMovement: BarKernelFactory = inputs => {
  const change = changeKernel();
  const average = windowKernel(numberInput(inputs, 'length'), values => sumOf(values) / values.length);
  const divisor = numberInput(inputs, 'divisor');
  return { update(bar, replace) {
    const move = change.update((bar.high + bar.low) / 2, replace);
    const volume = bar.volume ?? 0;
    return { eom: average.update(move === null || volume === 0 ? null : divisor * move * (bar.high - bar.low) / volume, replace) };
  } };
};

const elderForceIndex: BarKernelFactory = inputs => {
  const change = changeKernel();
  const smooth = gated(emaKernel(numberInput(inputs, 'length')));
  return { update(bar, replace) {
    const move = change.update(bar.close, replace);
    return { efi: smooth.update(move === null ? null : move * (bar.volume ?? 0), replace) };
  } };
};

export const VOLUME_KERNELS: Record<string, BarKernelFactory> = {
  obv, cmf, chaikinosc: chaikinOscillator, ad: accumulationDistribution, pvt: priceVolumeTrend, eom: easeOfMovement, efi: elderForceIndex,
};
