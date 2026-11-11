import type { Bar } from '@aitrader/contracts';
import { numberInput, sourceInput, type ResolvedInputs } from '../../domain/inputs';
import { priceOf } from '../../domain/source';
import type { BarKernel, BarKernelFactory } from './bar-kernel';
import { emaKernel, gated, rmaKernel, smaKernel, vwmaKernel, wmaKernel, type SeriesKernel } from './kernels';

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

export const MOVING_AVERAGE_KERNELS: Record<string, BarKernelFactory> = {
  sma: sourceMa('SMA'), ema: sourceMa('EMA'), wma: sourceMa('WMA'), vwma: sourceMa('VWMA', 'vwma'), hma, dema: emaChain('dema', 2), tema: emaChain('tema', 3),
};
