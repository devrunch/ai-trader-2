import { numberInput, sourceInput, stringInput, type ResolvedInputs } from '../../domain/inputs';
import { priceOf } from '../../domain/source';
import { minus, type BarKernel, type BarKernelFactory } from './bar-kernel';
import { RollingWindow, gated, rsiKernel, smaKernel, emaKernel } from './kernels';
import { maKernel } from './moving-average-kernels';

function rsi(inputs: ResolvedInputs): BarKernel {
  const kernel = rsiKernel(numberInput(inputs, 'length'));
  const source = sourceInput(inputs, 'source');
  return { update: (bar, replace) => ({ rsi: kernel.update(priceOf(bar, source), replace) }) };
}

function macd(inputs: ResolvedInputs): BarKernel {
  const oscillator = stringInput(inputs, 'oscillatorMaType');
  const fast = maKernel(oscillator, numberInput(inputs, 'fastLength'));
  const slow = maKernel(oscillator, numberInput(inputs, 'slowLength'));
  const signalLength = numberInput(inputs, 'signalLength');
  const signal = gated(stringInput(inputs, 'signalMaType') === 'SMA' ? smaKernel(signalLength) : emaKernel(signalLength));
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const price = priceOf(bar, source);
    const line = minus(fast.update(price, bar, replace), slow.update(price, bar, replace));
    const signalValue = signal.update(line, replace);
    return { histogram: minus(line, signalValue), macd: line, signal: signalValue };
  } };
}

function stoch(inputs: ResolvedInputs): BarKernel {
  const periodK = numberInput(inputs, 'periodK');
  const highs = new RollingWindow(periodK);
  const lows = new RollingWindow(periodK);
  const k = gated(smaKernel(numberInput(inputs, 'smoothK')));
  const d = gated(smaKernel(numberInput(inputs, 'periodD')));
  return { update(bar, replace) {
    const high = highs.update(bar.high, replace);
    const low = lows.update(bar.low, replace);
    let raw: number | null = null;
    if (high && low) {
      const highest = Math.max(...high);
      const lowest = Math.min(...low);
      raw = highest === lowest ? null : 100 * (bar.close - lowest) / (highest - lowest);
    }
    const kValue = k.update(raw, replace);
    return { k: kValue, d: d.update(kValue, replace) };
  } };
}

export const OSCILLATOR_KERNELS: Record<string, BarKernelFactory> = { rsi, macd, stoch };
