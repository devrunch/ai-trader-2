import type { Bar } from '@aitrader/contracts';
import { numberInput, sourceInput, type ResolvedInputs } from '../../domain/inputs';
import { priceOf } from '../../domain/source';
import type { BarKernel, BarKernelFactory } from './bar-kernel';
import { emaKernel, rmaKernel, smaKernel, vwmaKernel, wmaKernel, type SeriesKernel } from './kernels';

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

const sourceMa = (type: string) => (inputs: ResolvedInputs): BarKernel => {
  const ma = maKernel(type, numberInput(inputs, 'length'));
  const source = sourceInput(inputs, 'source');
  return { update: (bar, replace) => ({ ma: ma.update(priceOf(bar, source), bar, replace) }) };
};

export const MOVING_AVERAGE_KERNELS: Record<string, BarKernelFactory> = { sma: sourceMa('SMA'), ema: sourceMa('EMA'), wma: sourceMa('WMA') };
