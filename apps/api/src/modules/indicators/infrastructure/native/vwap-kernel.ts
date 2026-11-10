import { anchorKey } from '../../domain/anchor';
import { boolInput, numberInput, sourceInput, stringInput, type ResolvedInputs } from '../../domain/inputs';
import { priceOf } from '../../domain/source';
import type { RuntimeContext } from '../../application/ports/indicator-runtime';
import type { BarKernel } from './bar-kernel';

interface Sums { key: string; srcVolume: number; volume: number; srcSquaredVolume: number }

/** TradingView's VWAP: `ta.vwap(src, isNewPeriod, 1)` reset on the anchor in the exchange timezone; `null` volume counts as 0. */
export function vwapKernel(inputs: ResolvedInputs, context: RuntimeContext): BarKernel {
  const anchor = stringInput(inputs, 'anchor');
  const source = sourceInput(inputs, 'source');
  const percentage = stringInput(inputs, 'bandsMode') === 'Percentage';
  const bands = [1, 2, 3].map(n => ({ n, show: boolInput(inputs, `showBand${String(n)}`), mult: numberInput(inputs, `bandMult${String(n)}`) }));
  let committed: Sums | undefined;
  let current: Sums | undefined;
  return { update(bar, replace) {
    if (!replace) committed = current;
    const key = anchorKey(bar.time, anchor, context.timezone);
    const base = committed?.key === key ? committed : { key, srcVolume: 0, volume: 0, srcSquaredVolume: 0 };
    const price = priceOf(bar, source);
    const volume = bar.volume ?? 0;
    current = { key, srcVolume: base.srcVolume + price * volume, volume: base.volume + volume, srcSquaredVolume: base.srcSquaredVolume + price * price * volume };
    const values: Record<string, number | null> = { vwap: null };
    for (const { n } of bands) { values[`upper${String(n)}`] = null; values[`lower${String(n)}`] = null; }
    if (current.volume === 0) return values;
    const vwap = current.srcVolume / current.volume;
    const deviation = Math.sqrt(Math.max(current.srcSquaredVolume / current.volume - vwap * vwap, 0));
    const basis = percentage ? vwap * 0.01 : deviation;
    values.vwap = vwap;
    for (const { n, show, mult } of bands) {
      if (!show) continue;
      values[`upper${String(n)}`] = vwap + basis * mult;
      values[`lower${String(n)}`] = vwap - basis * mult;
    }
    return values;
  } };
}
