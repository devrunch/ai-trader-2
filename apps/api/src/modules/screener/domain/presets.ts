import type { BacktestCondition, ScreenSpec } from '@aitrader/contracts';

type BacktestIndicator = ScreenSpec['indicators'][number];
type Interval = ScreenSpec['interval'];
export interface PresetDef {
  id: string; name: string; description: string;
  indicators: BacktestIndicator[];
  /** Absent for a ranking preset: every symbol with data is ranked and the top `limit` are returned. */
  condition?: BacktestCondition;
  /** How matches are ordered; defaults to change percent, largest first. */
  sort: { by: string; order: 'asc' | 'desc' };
  /** Bars to load, and the fewest bars the preset can be evaluated on. */
  bars: number; minBars: number;
  /** Series reported with each row. */
  values: string[];
  intervals?: readonly Interval[];
}

const s = (name: string, offset?: number) => ({ kind: 'series' as const, name, ...(offset === undefined ? {} : { offset }) });
const v = (value: number) => ({ kind: 'value' as const, value });
const cmp = (left: ReturnType<typeof s> | ReturnType<typeof v>, op: 'gt' | 'gte' | 'lt' | 'lte' | 'crossesAbove', right: ReturnType<typeof s> | ReturnType<typeof v>): BacktestCondition => ({ kind: 'compare', left, op, right });
const rsi = (): BacktestIndicator => ({ name: 'rsi', indicatorId: 'rsi', inputs: { length: 14 } });
const ema = (length: number): BacktestIndicator => ({ name: `ema${String(length)}`, indicatorId: 'ema', inputs: { length } });
const DEFAULT_SORT = { by: 'changePct', order: 'desc' } as const;

export const PRESETS: readonly PresetDef[] = [
  { id: 'breakout-volume', name: 'Breakout on volume', description: 'Close above the highest high of the prior 20 bars, with volume above 1.5 times its 20-bar average.',
    indicators: [], condition: { kind: 'all', of: [cmp(s('close'), 'gt', s('highestHigh20')), cmp(s('volumeRatio'), 'gt', v(1.5))] },
    sort: { by: 'volumeRatio', order: 'desc' }, bars: 30, minBars: 21, values: ['volumeRatio', 'highestHigh20'] },
  { id: 'rsi-oversold', name: 'RSI oversold', description: 'RSI(14) below 30.', indicators: [rsi()], condition: cmp(s('rsi'), 'lt', v(30)),
    sort: { by: 'rsi', order: 'asc' }, bars: 120, minBars: 30, values: ['rsi'] },
  { id: 'rsi-overbought', name: 'RSI overbought', description: 'RSI(14) above 70.', indicators: [rsi()], condition: cmp(s('rsi'), 'gt', v(70)),
    sort: { by: 'rsi', order: 'desc' }, bars: 120, minBars: 30, values: ['rsi'] },
  { id: 'ema-cross-20-50', name: 'EMA 20 crosses above EMA 50', description: 'EMA(20) crossed above EMA(50) on the latest bar.',
    indicators: [ema(20), ema(50)], condition: cmp(s('ema20'), 'crossesAbove', s('ema50')), sort: DEFAULT_SORT, bars: 250, minBars: 60, values: ['ema20', 'ema50'] },
  { id: 'gap-up', name: 'Gap up', description: 'Open more than 2% above the previous close.', indicators: [], condition: cmp(s('gapPct'), 'gt', v(2)),
    sort: { by: 'gapPct', order: 'desc' }, bars: 30, minBars: 2, values: ['gapPct'] },
  { id: 'gap-down', name: 'Gap down', description: 'Open more than 2% below the previous close.', indicators: [], condition: cmp(s('gapPct'), 'lt', v(-2)),
    sort: { by: 'gapPct', order: 'asc' }, bars: 30, minBars: 2, values: ['gapPct'] },
  { id: '52w-high', name: '52-week high', description: 'Close at or above the highest high of the prior 252 daily bars.', indicators: [], condition: cmp(s('close'), 'gte', s('highestHigh252')),
    sort: DEFAULT_SORT, bars: 270, minBars: 253, values: ['highestHigh252'], intervals: ['1D'] },
  { id: '52w-low', name: '52-week low', description: 'Close at or below the lowest low of the prior 252 daily bars.', indicators: [], condition: cmp(s('close'), 'lte', s('lowestLow252')),
    sort: { by: 'changePct', order: 'asc' }, bars: 270, minBars: 253, values: ['lowestLow252'], intervals: ['1D'] },
  { id: 'nr7', name: 'NR7', description: 'The latest bar has the narrowest high-low range of the last 7 bars.', indicators: [], condition: cmp(s('range'), 'lte', s('lowestRange7')),
    sort: DEFAULT_SORT, bars: 30, minBars: 7, values: ['range', 'lowestRange7'] },
  { id: 'inside-bar', name: 'Inside bar', description: 'High below the previous high and low above the previous low.', indicators: [],
    condition: { kind: 'all', of: [cmp(s('high'), 'lt', s('high', 1)), cmp(s('low'), 'gt', s('low', 1))] }, sort: DEFAULT_SORT, bars: 30, minBars: 2, values: ['range'] },
  { id: 'top-gainers', name: 'Top gainers', description: 'The largest percentage gains over the latest bar.', indicators: [], sort: DEFAULT_SORT, bars: 30, minBars: 2, values: [] },
  { id: 'top-losers', name: 'Top losers', description: 'The largest percentage losses over the latest bar.', indicators: [], sort: { by: 'changePct', order: 'asc' }, bars: 30, minBars: 2, values: [] },
  { id: 'unusual-volume', name: 'Unusual volume', description: 'Volume above 3 times its 20-bar average.', indicators: [], condition: cmp(s('volumeRatio'), 'gt', v(3)),
    sort: { by: 'volumeRatio', order: 'desc' }, bars: 30, minBars: 21, values: ['volumeRatio'] },
];

export const presetById = (id: string): PresetDef | undefined => PRESETS.find(p => p.id === id);
