import { z } from 'zod';
import { DataStatusSchema, INTERVALS } from './market-data.js';

export const PRICE_SOURCES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];
/** Theme tokens; the web maps each to a CSS variable. */
export const INDICATOR_COLORS = ['blue', 'orange', 'violet', 'teal', 'red', 'green', 'gray', 'yellow'] as const;
export const PLOT_KINDS = ['line', 'histogram', 'area', 'step', 'circles'] as const;

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/);
const common = { id, title: z.string().min(1).max(80), group: z.string().max(80).optional(), tooltip: z.string().max(300).optional() };
const bounds = { min: z.number().optional(), max: z.number().optional(), step: z.number().positive().optional() };

export const IndicatorInputDefSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...common, type: z.literal('int'), default: z.number().int(), ...bounds }),
  z.strictObject({ ...common, type: z.literal('float'), default: z.number(), ...bounds }),
  z.strictObject({ ...common, type: z.literal('bool'), default: z.boolean() }),
  z.strictObject({ ...common, type: z.literal('string'), default: z.string(), options: z.array(z.string().min(1)).min(1) })
    .refine(input => input.options.includes(input.default), { message: 'Default must be one of the options', path: ['default'] }),
  z.strictObject({ ...common, type: z.literal('source'), default: z.enum(PRICE_SOURCES) }),
]);
export type IndicatorInputDef = z.infer<typeof IndicatorInputDefSchema>;

export const IndicatorPlotDefSchema = z.strictObject({
  id, title: z.string().min(1).max(80), kind: z.enum(PLOT_KINDS), color: z.enum(INDICATOR_COLORS), lineWidth: z.number().int().min(1).max(4),
});
export type IndicatorPlotDef = z.infer<typeof IndicatorPlotDefSchema>;

export const IndicatorLevelSchema = z.strictObject({ id, title: z.string().min(1).max(80), value: z.number() });

/** `builtin:<id>@<version>`; `script:<id>@<version>` arrives with saved scripts (FR-IN-31). */
export const IndicatorRefSchema = z.string().regex(/^builtin:[a-z][a-z0-9]{0,39}@[1-9]\d{0,3}$/);

/** A pasted Pine script's identity: a hash of its source (the script is not saved yet). */
export const PineRefSchema = z.string().regex(/^pine:[0-9a-f]{12}@1$/);

export const IndicatorDefinitionSchema = z.strictObject({
  ref: z.union([IndicatorRefSchema, PineRefSchema]), id: z.string().regex(/^[a-z][a-z0-9]{0,39}$/), version: z.number().int().positive(),
  name: z.string().min(1).max(120), shortName: z.string().min(1).max(40),
  /** `true` draws on the price pane; `false` in its own pane. */
  overlay: z.boolean(),
  inputs: z.array(IndicatorInputDefSchema), plots: z.array(IndicatorPlotDefSchema).min(1), levels: z.array(IndicatorLevelSchema),
});
export type IndicatorDefinition = z.infer<typeof IndicatorDefinitionSchema>;
/** The definition of a Pine script (its `input.*` calls and plots), so the settings dialog works for it like for a built-in. */
export const IndicatorDescribeRequestSchema = z.strictObject({ source: z.string().min(1).max(100_000) });
export const IndicatorListResponseSchema = z.strictObject({ indicators: z.array(IndicatorDefinitionSchema) });
/** Every built-in also exists as Pine; users can read and fork it (FR-IN-31). */
export const IndicatorDetailResponseSchema = z.strictObject({ definition: IndicatorDefinitionSchema, pine: z.string() });

const instanceId = z.string().min(1).max(100);

/** A `source` input fed by another indicator's plot on the same chart (FR-IN-13); a price source stays a plain string. */
export const IndicatorSourceRefSchema = z.strictObject({ from: instanceId, plot: id });
export type IndicatorSourceRef = z.infer<typeof IndicatorSourceRefSchema>;
/** Longest chain A -> B -> C the server computes, the target included. */
export const INDICATOR_CHAIN_MAX = 5;

export const IndicatorInputValuesSchema = z.record(z.string().max(40), z.union([z.number(), z.boolean(), z.string().max(200)]));
export type IndicatorInputValues = z.infer<typeof IndicatorInputValuesSchema>;
/** Input values of an indicator on a chart: plain values, or a `source` pointing at another indicator (FR-IN-13). */
export const IndicatorChartInputsSchema = z.record(z.string().max(40), z.union([z.number(), z.boolean(), z.string().max(200), IndicatorSourceRefSchema]));
export type IndicatorChartInputs = z.infer<typeof IndicatorChartInputsSchema>;

export function isSourceRef(value: unknown): value is IndicatorSourceRef {
  return IndicatorSourceRefSchema.safeParse(value).success;
}

export const IndicatorSpecSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('builtin'), id: z.string().regex(/^[a-z][a-z0-9]{0,39}$/), version: z.number().int().positive().optional(),
    inputs: IndicatorChartInputsSchema.default({}) }),
  z.strictObject({ kind: z.literal('pine'), source: z.string().min(1).max(100_000), inputs: IndicatorInputValuesSchema.default({}) }),
]);
export type IndicatorSpec = z.infer<typeof IndicatorSpecSchema>;

/** An indicator on the chart, named so another one's `source` can point at it. `label` is for messages ("RSI 14"). */
export const IndicatorChartInstanceSchema = z.strictObject({ instanceId, label: z.string().max(80).optional(), indicator: IndicatorSpecSchema });
export type IndicatorChartInstance = z.infer<typeof IndicatorChartInstanceSchema>;

export const IndicatorComputeRequestSchema = z.strictObject({
  symbol: z.string().trim().min(3).max(80), interval: z.enum(INTERVALS), indicator: IndicatorSpecSchema,
  /** The target's own id and label, needed when its inputs point at `others`. */
  instanceId: instanceId.optional(), label: z.string().max(80).optional(),
  /** The other indicators on the chart; only those the target reaches through source refs are computed. */
  others: z.array(IndicatorChartInstanceSchema).max(30).optional(),
  range: z.strictObject({ limit: z.number().int().min(1).max(5000).default(500), before: z.number().int().nonnegative().optional() }).default({ limit: 500 }),
});
export type IndicatorComputeRequest = z.infer<typeof IndicatorComputeRequestSchema>;

export const IndicatorPlotSeriesSchema = z.strictObject({ id: z.string(), values: z.array(z.number().nullable()) });
export type IndicatorPlotSeries = z.infer<typeof IndicatorPlotSeriesSchema>;

/** Columnar: `plots[i].values[j]` belongs to `times[j]`; `null` where Pine has `na`. */
export const IndicatorResultSchema = z.strictObject({
  instrumentId: z.string(), resolvedId: z.string(), interval: z.enum(INTERVALS), ref: z.string(), inputs: IndicatorChartInputsSchema,
  times: z.array(z.number().int()), plots: z.array(IndicatorPlotSeriesSchema), status: DataStatusSchema,
  /** Why some values are `na` beyond warm-up, for example no data for a `request.security` symbol (E27). */
  reason: z.string().max(300).optional(),
}).refine(result => result.plots.every(plot => plot.values.length === result.times.length), { message: 'One value per bar time', path: ['plots'] });
export type IndicatorResult = z.infer<typeof IndicatorResultSchema>;

export const IndicatorUpdateSchema = z.strictObject({
  instanceId: z.string().min(1).max(100), barTime: z.number().int(), values: z.record(z.string(), z.number().nullable()), seq: z.number().int().nonnegative(),
});
export type IndicatorUpdate = z.infer<typeof IndicatorUpdateSchema>;

/** Live indicators on a bar subscription the socket already holds (FR-IN-5). Instance ids are the client's own. */
export const IndicatorSubscribeSchema = z.strictObject({
  subscriptionId: z.uuid(),
  indicators: z.array(IndicatorChartInstanceSchema).min(1).max(10),
});
export const IndicatorUnsubscribeSchema = z.strictObject({ subscriptionId: z.uuid(), instanceIds: z.array(z.string().min(1).max(100)).max(50).optional() });
export const IndicatorSubscribeAckSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), results: z.array(z.union([
    z.strictObject({ instanceId: z.string(), result: IndicatorResultSchema }),
    z.strictObject({ instanceId: z.string(), error: z.strictObject({ code: z.string(), message: z.string() }) }),
  ])) }),
  z.strictObject({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);
export const LiveIndicatorSchema = z.strictObject({ subscriptionId: z.uuid(), ...IndicatorUpdateSchema.shape });
