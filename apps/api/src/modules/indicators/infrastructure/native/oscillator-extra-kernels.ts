import { boolInput, numberInput, sourceInput, type ResolvedInputs } from '../../domain/inputs';
import { priceOf } from '../../domain/source';
import { minus, type BarKernel, type BarKernelFactory } from './bar-kernel';
import { previousBar, stochKernel } from './extremes-kernel';
import { RollingWindow, changeKernel, delayKernel, emaKernel, gated, rocKernel, rsiKernel, smaKernel, sumOf, wmaKernel } from './kernels';
import { maKernel } from './moving-average-kernels';

const divide = (a: number | null, b: number | null): number | null => (a === null || b === null || b === 0 ? null : a / b);

function stochRsi(inputs: ResolvedInputs): BarKernel {
  const rsi = rsiKernel(numberInput(inputs, 'lengthRsi'));
  const stoch = stochKernel(numberInput(inputs, 'lengthStoch'));
  const k = gated(smaKernel(numberInput(inputs, 'smoothK')));
  const d = gated(smaKernel(numberInput(inputs, 'smoothD')));
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const value = rsi.update(priceOf(bar, source), replace);
    const kValue = k.update(value === null ? null : stoch.update(value, value, value, replace), replace);
    return { k: kValue, d: d.update(kValue, replace) };
  } };
}

/** Two EMAs in a row, each fed once its input is defined (`ta.ema(ta.ema(x, long), short)`). */
function doubleEma(long: number, short: number): { update(value: number | null, replace: boolean): number | null } {
  const first = gated(emaKernel(long));
  const second = gated(emaKernel(short));
  return { update: (value, replace) => second.update(first.update(value, replace), replace) };
}

function tsi(inputs: ResolvedInputs): BarKernel {
  const change = changeKernel();
  const signed = doubleEma(numberInput(inputs, 'longLength'), numberInput(inputs, 'shortLength'));
  const absolute = doubleEma(numberInput(inputs, 'longLength'), numberInput(inputs, 'shortLength'));
  const signal = gated(emaKernel(numberInput(inputs, 'signalLength')));
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const move = change.update(priceOf(bar, source), replace);
    const ratio = divide(signed.update(move, replace), absolute.update(move === null ? null : Math.abs(move), replace));
    const value = ratio === null ? null : 100 * ratio;
    return { tsi: value, signal: signal.update(value, replace) };
  } };
}

/** Ultimate Oscillator: buying pressure over true range, summed over three windows weighted 4:2:1. */
function ultimate(inputs: ResolvedInputs): BarKernel {
  const lengths = [numberInput(inputs, 'fast'), numberInput(inputs, 'middle'), numberInput(inputs, 'slow')] as const;
  const size = Math.max(...lengths);
  const pressure = new RollingWindow(size);
  const ranges = new RollingWindow(size);
  const previous = previousBar();
  return { update(bar, replace) {
    const before = previous.advance(bar, replace);
    if (!before) return { uo: null };
    const low = Math.min(bar.low, before.close);
    const bp = pressure.update(bar.close - low, replace);
    const tr = ranges.update(Math.max(bar.high, before.close) - low, replace);
    if (!bp || !tr) return { uo: null };
    const average = (length: number): number | null => divide(sumOf(bp.slice(-length)), sumOf(tr.slice(-length)));
    const [fast, middle, slow] = lengths.map(average);
    return { uo: fast === undefined || middle === undefined || slow === undefined || fast === null || middle === null || slow === null ? null : 100 * (4 * fast + 2 * middle + slow) / 7 };
  } };
}

function chandeMomentum(inputs: ResolvedInputs): BarKernel {
  const change = changeKernel();
  const length = numberInput(inputs, 'length');
  const gains = new RollingWindow(length);
  const losses = new RollingWindow(length);
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const move = change.update(priceOf(bar, source), replace);
    if (move === null) return { cmo: null };
    const up = gains.update(Math.max(move, 0), replace);
    const down = losses.update(Math.max(-move, 0), replace);
    if (!up || !down) return { cmo: null };
    const [gain, loss] = [sumOf(up), sumOf(down)];
    const ratio = divide(gain - loss, gain + loss);
    return { cmo: ratio === null ? null : 100 * ratio };
  } };
}

const awesome: BarKernelFactory = () => {
  const fast = smaKernel(5);
  const slow = smaKernel(34);
  return { update(bar, replace) {
    const price = priceOf(bar, 'hl2');
    return { ao: minus(fast.update(price, replace), slow.update(price, replace)) };
  } };
};

/** Close less the average, one of them shifted `length / 2 + 1` bars (the close when centred, the average otherwise). */
function detrended(inputs: ResolvedInputs): BarKernel {
  const length = numberInput(inputs, 'length');
  const back = Math.floor(length / 2) + 1;
  const centered = boolInput(inputs, 'centered');
  const average = smaKernel(length);
  const pastClose = delayKernel(back);
  const pastAverage = delayKernel(back);
  return { update(bar, replace) {
    const now = average.update(bar.close, replace);
    const closeThen = pastClose.update(bar.close, replace);
    const averageThen = pastAverage.update(now, replace);
    return { dpo: centered ? minus(closeThen, now) : minus(bar.close, averageThen) };
  } };
}

function ppo(inputs: ResolvedInputs): BarKernel {
  const type = boolInput(inputs, 'exponential') ? 'EMA' : 'SMA';
  const short = maKernel(type, numberInput(inputs, 'shortLength'));
  const long = maKernel(type, numberInput(inputs, 'longLength'));
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const price = priceOf(bar, source);
    const slow = long.update(price, bar, replace);
    const ratio = divide(minus(short.update(price, bar, replace), slow), slow);
    return { ppo: ratio === null ? null : ratio * 100 };
  } };
}

function coppock(inputs: ResolvedInputs): BarKernel {
  const long = rocKernel(numberInput(inputs, 'longRoc'));
  const short = rocKernel(numberInput(inputs, 'shortRoc'));
  const smooth = gated(wmaKernel(numberInput(inputs, 'length')));
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const price = priceOf(bar, source);
    const [far, near] = [long.update(price, replace), short.update(price, replace)];
    return { coppock: smooth.update(far === null || near === null ? null : far + near, replace) };
  } };
}

/** Know Sure Thing: four smoothed rates of change weighted 1..4, and its signal SMA. */
function knowSureThing(inputs: ResolvedInputs): BarKernel {
  const legs = [1, 2, 3, 4].map(i => ({ roc: rocKernel(numberInput(inputs, `roc${String(i)}`)), sma: gated(smaKernel(numberInput(inputs, `sma${String(i)}`))), weight: i }));
  const signal = gated(smaKernel(numberInput(inputs, 'signal')));
  return { update(bar, replace) {
    const parts = legs.map(leg => ({ value: leg.sma.update(leg.roc.update(bar.close, replace), replace), weight: leg.weight }));
    const kst = parts.some(part => part.value === null) ? null : parts.reduce((total, part) => total + part.weight * (part.value ?? 0), 0);
    return { kst, signal: signal.update(kst, replace) };
  } };
}

const balanceOfPower: BarKernelFactory = () => ({
  update: bar => ({ bop: divide(bar.close - bar.open, bar.high - bar.low) }),
});

function volumeOscillator(inputs: ResolvedInputs): BarKernel {
  const short = emaKernel(numberInput(inputs, 'shortLength'));
  const long = emaKernel(numberInput(inputs, 'longLength'));
  return { update(bar, replace) {
    const volume = bar.volume ?? 0;
    const slow = long.update(volume, replace);
    const ratio = divide(minus(short.update(volume, replace), slow), slow);
    return { osc: ratio === null ? null : 100 * ratio };
  } };
}

export const EXTRA_OSCILLATOR_KERNELS: Record<string, BarKernelFactory> = {
  stochrsi: stochRsi, tsi, uo: ultimate, cmo: chandeMomentum, ao: awesome, dpo: detrended, ppo, coppock, kst: knowSureThing, bop: balanceOfPower, volosc: volumeOscillator,
};
