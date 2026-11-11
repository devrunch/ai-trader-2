import type { Builtin } from './builtins/define';
import { DONCHIAN, KELTNER } from './builtins/channels';
import { ALMA, DEMA, EMA, ENVELOPE, HMA, LSMA, MCGINLEY, SMA, SMMA, TEMA, VWMA, WMA } from './builtins/moving-averages';
import { AWESOME, BOP, CMO, COPPOCK, DPO, KST, PPO, STOCH_RSI, TSI, ULTIMATE, VOLUME_OSCILLATOR } from './builtins/oscillators-extra';
import { CCI, MFI, MOMENTUM, ROC, WILLIAMS_R } from './builtins/momentum';
import { MACD, RSI, STOCH } from './builtins/oscillators';
import { ATR, BB, BOLLINGER_PERCENT_B, BOLLINGER_WIDTH, HISTORICAL_VOLATILITY, SUPERTREND } from './builtins/volatility';
import { PIVOTS } from './builtins/pivots';
import { ADX, AROON, DMI, ICHIMOKU, PSAR } from './builtins/trend';
import { ACCUMULATION_DISTRIBUTION, CHAIKIN_OSCILLATOR, CMF, EASE_OF_MOVEMENT, ELDER_FORCE_INDEX, OBV, PVT } from './builtins/volume';
import { VWAP } from './builtins/vwap';
import { UnknownIndicatorError } from './errors';

export type { Builtin } from './builtins/define';

/** Wave 1 (FR-IN-7): the first ten, the P4-13a batch, then the P4-13b batch. */
export const BUILTINS: readonly Builtin[] = [SMA, EMA, WMA, RSI, MACD, BB, ATR, STOCH, VWAP, SUPERTREND,
  DMI, ADX, PSAR, ICHIMOKU, DONCHIAN, KELTNER, CCI, MFI, OBV, WILLIAMS_R, ROC, MOMENTUM, HMA, VWMA, DEMA, TEMA, AROON, CMF, PIVOTS,
  STOCH_RSI, TSI, ULTIMATE, CMO, AWESOME, DPO, PPO, COPPOCK, KST, BOP, CHAIKIN_OSCILLATOR, ACCUMULATION_DISTRIBUTION, PVT, EASE_OF_MOVEMENT, ELDER_FORCE_INDEX,
  HISTORICAL_VOLATILITY, BOLLINGER_PERCENT_B, BOLLINGER_WIDTH, ENVELOPE, LSMA, ALMA, SMMA, MCGINLEY, VOLUME_OSCILLATOR];

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
