import type { Builtin } from './builtins/define';
import { DONCHIAN, KELTNER } from './builtins/channels';
import { DEMA, EMA, HMA, SMA, TEMA, VWMA, WMA } from './builtins/moving-averages';
import { CCI, MFI, MOMENTUM, ROC, WILLIAMS_R } from './builtins/momentum';
import { MACD, RSI, STOCH } from './builtins/oscillators';
import { ATR, BB, SUPERTREND } from './builtins/volatility';
import { PIVOTS } from './builtins/pivots';
import { ADX, AROON, DMI, ICHIMOKU, PSAR } from './builtins/trend';
import { CMF, OBV } from './builtins/volume';
import { VWAP } from './builtins/vwap';
import { UnknownIndicatorError } from './errors';

export type { Builtin } from './builtins/define';

/** Wave 1 (FR-IN-7): the first ten, then the batch added in P4-13a. */
export const BUILTINS: readonly Builtin[] = [SMA, EMA, WMA, RSI, MACD, BB, ATR, STOCH, VWAP, SUPERTREND,
  DMI, ADX, PSAR, ICHIMOKU, DONCHIAN, KELTNER, CCI, MFI, OBV, WILLIAMS_R, ROC, MOMENTUM, HMA, VWMA, DEMA, TEMA, AROON, CMF, PIVOTS];

export function findBuiltin(id: string, version?: number): Builtin {
  const found = BUILTINS.find(b => b.definition.id === id && (version === undefined || b.definition.version === version));
  if (!found) throw new UnknownIndicatorError(version === undefined ? `builtin:${id}` : `builtin:${id}@${String(version)}`);
  return found;
}

/** Parses `builtin:<id>@<version>`. */
export function findBuiltinByRef(ref: string): Builtin {
  const match = /^builtin:([a-z][a-z0-9]{0,39})@([1-9]\d{0,3})$/.exec(ref);
  if (!match?.[1] || !match[2]) throw new UnknownIndicatorError(ref);
  return findBuiltin(match[1], Number(match[2]));
}
