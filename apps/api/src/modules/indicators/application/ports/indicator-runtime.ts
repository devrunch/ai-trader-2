import type { Bar, Interval } from '@aitrader/contracts';
import type { Builtin } from '../../domain/catalog';
import type { ResolvedInputs } from '../../domain/inputs';

/** One row per bar: plot id → value, `null` where Pine has `na`. */
export type PlotValues = Readonly<Record<string, number | null>>;

export type IndicatorProgram =
  | { kind: 'builtin'; builtin: Builtin; inputs: ResolvedInputs }
  | { kind: 'pine'; source: string; inputs: ResolvedInputs };

export interface RuntimeContext { instrumentId: string; interval: Interval; /** IANA zone of the instrument's exchange. */ timezone: string }

export interface IndicatorInstance {
  /** Why some values are `na` beyond warm-up, for example no data for a `request.security` symbol (E27). */
  readonly reason?: string | undefined;
  /** Feeds history oldest first and returns one row per bar. */
  seed(bars: readonly Bar[]): Promise<PlotValues[]>;
  /** Adds a newer bar, or with `replace` recomputes the last one, from saved state (FR-IN-6). */
  update(bar: Bar, replace: boolean): Promise<PlotValues>;
  close(): void;
}

/** FR-IN-31: native (trading-signals) and Pine (PineTS) implement this; callers never see which ran. */
export interface IndicatorRuntime {
  readonly name: string;
  supports(program: IndicatorProgram): boolean;
  create(program: IndicatorProgram, context: RuntimeContext): IndicatorInstance;
}
