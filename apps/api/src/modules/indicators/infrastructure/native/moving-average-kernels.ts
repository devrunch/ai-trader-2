import type { Bar } from '@aitrader/contracts';
import { boolInput, numberInput, sourceInput, type ResolvedInputs } from '../../domain/inputs';
import { priceOf } from '../../domain/source';
import type { BarKernel, BarKernelFactory } from './bar-kernel';
import { RollingWindow, emaKernel, gated, rmaKernel, smaKernel, sumOf, vwmaKernel, wmaKernel, type SeriesKernel } from './kernels';

/** A moving average of a price series; VWMA also reads the bar's volume (`null` counts as 0). */
export interface MaKernel { update(value: number, bar: Bar, replace: boolean): number | null }

const plain = (kernel: SeriesKernel): MaKernel => ({ update: (value, _bar, replace) => kernel.update(value, replace) });

export function maKernel(type: string, length: number): MaKernel {
  switch (type) {
    case 'SMA': return plain(smaKernel(length));
    case 'EMA': return plain(emaKernel(length));
    case 'SMMA (RMA)':
    case 'RMA': return plain(rmaKernel(length));
    case 'WMA': return plain(wmaKernel(length));
    case 'VWMA': { const vwma = vwmaKernel(length); return { update: (value, bar, replace) => vwma.update(value, bar.volume ?? 0, replace) }; }
    default: throw new Error(`Unsupported moving average: ${type}`);
  }
}

const sourceMa = (type: string, plot = 'ma') => (inputs: ResolvedInputs): BarKernel => {
  const ma = maKernel(type, numberInput(inputs, 'length'));
  const source = sourceInput(inputs, 'source');
  return { update: (bar, replace) => ({ [plot]: ma.update(priceOf(bar, source), bar, replace) }) };
};

/** Pine's `ta.hma`: wma(2 × wma(src, ⌊n/2⌋) − wma(src, n), round(√n)). */
const hma = (inputs: ResolvedInputs): BarKernel => {
  const length = numberInput(inputs, 'length');
  const half = wmaKernel(Math.max(1, Math.floor(length / 2)));
  const full = wmaKernel(length);
  const smooth = gated(wmaKernel(Math.max(1, Math.round(Math.sqrt(length)))));
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const price = priceOf(bar, source);
    const fast = half.update(price, replace);
    const slow = full.update(price, replace);
    return { hma: smooth.update(fast === null || slow === null ? null : 2 * fast - slow, replace) };
  } };
};

/** DEMA and TEMA: EMAs of EMAs (each fed once its input is defined), combined as 2·e1 − e2 and 3·(e1 − e2) + e3. */
const emaChain = (id: string, depth: 2 | 3) => (inputs: ResolvedInputs): BarKernel => {
  const length = numberInput(inputs, 'length');
  const first = emaKernel(length);
  const second = gated(emaKernel(length));
  const third = gated(emaKernel(length));
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const e1 = first.update(priceOf(bar, source), replace);
    const e2 = second.update(e1, replace);
    if (e1 === null || e2 === null) return { [id]: null };
    if (depth === 2) return { [id]: 2 * e1 - e2 };
    const e3 = third.update(e2, replace);
    return { [id]: e3 === null ? null : 3 * (e1 - e2) + e3 };
  } };
};

const envelope = (inputs: ResolvedInputs): BarKernel => {
  const basis = maKernel(boolInput(inputs, 'exponential') ? 'EMA' : 'SMA', numberInput(inputs, 'length'));
  const k = numberInput(inputs, 'percent') / 100;
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const mid = basis.update(priceOf(bar, source), bar, replace);
    return { basis: mid, upper: mid === null ? null : mid * (1 + k), lower: mid === null ? null : mid * (1 - k) };
  } };
};

/** Pine's `ta.linreg(src, length, offset)`: the least-squares line over the window, read `offset` bars before the newest. */
const lsma = (inputs: ResolvedInputs): BarKernel => {
  const length = numberInput(inputs, 'length');
  const offset = numberInput(inputs, 'linregOffset');
  const window = new RollingWindow(length);
  const source = sourceInput(inputs, 'source');
  const middle = (length - 1) / 2;
  const spread = length * (length * length - 1) / 12;
  return { update(bar, replace) {
    const values = window.update(priceOf(bar, source), replace);
    if (!values) return { lsma: null };
    const mean = sumOf(values) / length;
    const slope = spread === 0 ? 0 : sumOf(values.map((value, i) => (i - middle) * (value - mean))) / spread;
    return { lsma: mean + slope * (length - 1 - offset - middle) };
  } };
};

/** Pine's `ta.alma`: a Gaussian-weighted window centred at `offset` of its length with width length / sigma. */
const alma = (inputs: ResolvedInputs): BarKernel => {
  const length = numberInput(inputs, 'length');
  const centre = numberInput(inputs, 'almaOffset') * (length - 1);
  const width = length / numberInput(inputs, 'sigma');
  const weights = Array.from({ length }, (_, i) => Math.exp(-((i - centre) ** 2) / (2 * width * width)));
  const norm = sumOf(weights);
  const window = new RollingWindow(length);
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const values = window.update(priceOf(bar, source), replace);
    return { alma: values ? sumOf(values.map((value, i) => value * (weights[i] ?? 0))) / norm : null };
  } };
};

/** McGinley Dynamic: seeded with the EMA, then moves by (src − mg) / (length × (src / mg)⁴). */
const mcginley = (inputs: ResolvedInputs): BarKernel => {
  const length = numberInput(inputs, 'length');
  const seed = emaKernel(length);
  const source = sourceInput(inputs, 'source');
  let previous: number | null = null;
  let current: number | null = null;
  return { update(bar, replace) {
    if (!replace) previous = current;
    const price = priceOf(bar, source);
    const start = seed.update(price, replace);
    current = previous === null ? start : previous + (price - previous) / (length * (price / previous) ** 4);
    return { mg: current };
  } };
};

export const MOVING_AVERAGE_KERNELS: Record<string, BarKernelFactory> = {
  smma: sourceMa('RMA', 'smma'), envelope, lsma, alma, mcginley, sma: sourceMa('SMA'), ema: sourceMa('EMA'), wma: sourceMa('WMA'), vwma: sourceMa('VWMA', 'vwma'), hma, dema: emaChain('dema', 2), tema: emaChain('tema', 3),
};
