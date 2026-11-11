import { boolInput, numberInput, sourceInput, stringInput, type ResolvedInputs } from '../../domain/inputs';
import { priceOf } from '../../domain/source';
import type { BarKernel, BarKernelFactory } from './bar-kernel';
import { RollingExtremes } from './extremes-kernel';
import { rmaKernel, trueRangeKernel } from './kernels';
import { maKernel } from './moving-average-kernels';
import { atrSeries } from './volatility-kernels';

function donchian(inputs: ResolvedInputs): BarKernel {
  const extremes = new RollingExtremes(numberInput(inputs, 'length'));
  return { update(bar, replace) {
    const range = extremes.update(bar, replace);
    return range ? { basis: (range.high + range.low) / 2, upper: range.high, lower: range.low } : { basis: null, upper: null, lower: null };
  } };
}

/** Keltner: the basis ± `mult` × the chosen range (ATR, `ta.tr(true)` or the RMA of high − low). */
function keltner(inputs: ResolvedInputs): BarKernel {
  const length = numberInput(inputs, 'length');
  const basis = maKernel(boolInput(inputs, 'exponential') ? 'EMA' : 'SMA', length);
  const mult = numberInput(inputs, 'mult');
  const source = sourceInput(inputs, 'source');
  const style = stringInput(inputs, 'bandsStyle');
  const atr = atrSeries('RMA', numberInput(inputs, 'atrLength'));
  const trueRange = trueRangeKernel();
  const rangeRma = rmaKernel(length);
  return { update(bar, replace) {
    const mid = basis.update(priceOf(bar, source), bar, replace);
    // All three run every bar so each keeps its own state.
    const atrValue = atr.update(bar, replace);
    const trValue = trueRange.update(bar, replace);
    const rangeValue = rangeRma.update(bar.high - bar.low, replace);
    const range = style === 'True Range' ? trValue : style === 'Average True Range' ? atrValue : rangeValue;
    if (mid === null || range === null) return { basis: mid, upper: null, lower: null };
    return { basis: mid, upper: mid + range * mult, lower: mid - range * mult };
  } };
}

export const CHANNEL_KERNELS: Record<string, BarKernelFactory> = { donchian, kc: keltner };
