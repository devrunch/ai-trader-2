import { z } from 'zod';
import { ChartActionSchema, DrawingIntentSchema, INTERVALS, IndicatorInputValuesSchema, type ActionCardDto, type AgentAction, type IndicatorComputeRequest, type IndicatorDefinition, type IndicatorResult } from '@aitrader/contracts';
import { guardedTool, orJsonString, type GuardDeps, type GuardedTool } from './guarded-tool';

const SYMBOL = z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/, 'canonical EXCHANGE:TICKER id');
const TAIL_MAX = 300;

export interface IndicatorToolServices {
  list(): IndicatorDefinition[];
  compute(request: IndicatorComputeRequest): Promise<IndicatorResult>;
}
export interface ActionCardPort { propose(userId: string, action: AgentAction): Promise<ActionCardDto> }

/** Indicator reads (FR-AG-5): the catalog, and server-computed values (the model never computes numbers itself). */
export function buildIndicatorTools(s: IndicatorToolServices, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'listIndicators', description: 'The built-in indicators: id, name, and inputs with defaults and bounds.',
      input: z.looseObject({}), run: () => Promise.resolve(s.list().map(d => ({ id: d.id, name: d.name, overlay: d.overlay,
        inputs: d.inputs.map(({ id, title, type, default: value, ...rest }) => ({ id, title, type, default: value,
          ...('min' in rest ? { min: rest.min } : {}), ...('max' in rest ? { max: rest.max } : {}), ...('options' in rest ? { options: rest.options } : {}) })) }))) }, deps),
    guardedTool({ name: 'getIndicator', description: 'The latest values of one built-in indicator on one instrument and interval (at most 300 bars), computed by the server.',
      input: z.strictObject({ symbol: SYMBOL, interval: z.enum(INTERVALS), indicatorId: z.string().regex(/^[a-z][a-z0-9]{0,39}$/),
        inputs: orJsonString(IndicatorInputValuesSchema).default({}), bars: z.number().int().min(1).max(TAIL_MAX).default(50) }),
      run: async input => {
        const result = await s.compute({ symbol: input.symbol, interval: input.interval, indicator: { kind: 'builtin', id: input.indicatorId, inputs: input.inputs },
          range: { limit: Math.max(input.bars, 500) } });
        const from = Math.max(0, result.times.length - input.bars);
        return { instrumentId: result.instrumentId, interval: result.interval, ref: result.ref, inputs: result.inputs, status: result.status,
          times: result.times.slice(from), plots: result.plots.map(p => ({ id: p.id, values: p.values.slice(from) })) };
      } }, deps),
  ];
}

/**
 * Proposals only (FR-AG-17): the tool records a card the user must apply or dismiss in the chat. It changes nothing by itself,
 * and there is no order, trade or broker action among the kinds.
 */
export function buildActionTools(cards: ActionCardPort, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'proposeChartAction',
      description: 'Propose a change to the user\'s chart for them to confirm: add an indicator (with inputs) or open a symbol. Nothing changes until the user applies the card.',
      input: ChartActionSchema, run: (action, ctx) => cards.propose(ctx.userId, action) }, deps),
    guardedTool({ name: 'proposeDrawing',
      description: 'Propose chart drawings computed by the server from real bars: support/resistance levels, a trend line through recent swings, or the high/low of a time range. The result shows the computed prices; the user applies the card to draw them.',
      input: DrawingIntentSchema, run: (intent, ctx) => cards.propose(ctx.userId, { kind: 'draw', intent }) }, deps),
  ];
}
