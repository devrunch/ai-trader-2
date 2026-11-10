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

export const IndicatorDefinitionSchema = z.strictObject({
  ref: IndicatorRefSchema, id: z.string().regex(/^[a-z][a-z0-9]{0,39}$/), version: z.number().int().positive(),
  name: z.string().min(1).max(120), shortName: z.string().min(1).max(40),
  /** `true` draws on the price pane; `false` in its own pane. */
  overlay: z.boolean(),
  inputs: z.array(IndicatorInputDefSchema), plots: z.array(IndicatorPlotDefSchema).min(1), levels: z.array(IndicatorLevelSchema),
});
export type IndicatorDefinition = z.infer<typeof IndicatorDefinitionSchema>;
export const IndicatorListResponseSchema = z.strictObject({ indicators: z.array(IndicatorDefinitionSchema) });
/** Every built-in also exists as Pine; users can read and fork it (FR-IN-31). */
export const IndicatorDetailResponseSchema = z.strictObject({ definition: IndicatorDefinitionSchema, pine: z.string() });

export const IndicatorInputValuesSchema = z.record(z.string().max(40), z.union([z.number(), z.boolean(), z.string().max(200)]));
export type IndicatorInputValues = z.infer<typeof IndicatorInputValuesSchema>;

export const IndicatorSpecSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('builtin'), id: z.string().regex(/^[a-z][a-z0-9]{0,39}$/), version: z.number().int().positive().optional(),
    inputs: IndicatorInputValuesSchema.default({}) }),
  z.strictObject({ kind: z.literal('pine'), source: z.string().min(1).max(100_000), inputs: IndicatorInputValuesSchema.default({}) }),
]);
export type IndicatorSpec = z.infer<typeof IndicatorSpecSchema>;

export const IndicatorComputeRequestSchema = z.strictObject({
  symbol: z.string().trim().min(3).max(80), interval: z.enum(INTERVALS), indicator: IndicatorSpecSchema,
  range: z.strictObject({ limit: z.number().int().min(1).max(5000).default(500), before: z.number().int().nonnegative().optional() }).default({ limit: 500 }),
});
export type IndicatorComputeRequest = z.infer<typeof IndicatorComputeRequestSchema>;

export const IndicatorPlotSeriesSchema = z.strictObject({ id: z.string(), values: z.array(z.number().nullable()) });
export type IndicatorPlotSeries = z.infer<typeof IndicatorPlotSeriesSchema>;

/** Columnar: `plots[i].values[j]` belongs to `times[j]`; `null` where Pine has `na`. */
export const IndicatorResultSchema = z.strictObject({
  instrumentId: z.string(), resolvedId: z.string(), interval: z.enum(INTERVALS), ref: z.string(), inputs: IndicatorInputValuesSchema,
  times: z.array(z.number().int()), plots: z.array(IndicatorPlotSeriesSchema), status: DataStatusSchema,
}).refine(result => result.plots.every(plot => plot.values.length === result.times.length), { message: 'One value per bar time', path: ['plots'] });
export type IndicatorResult = z.infer<typeof IndicatorResultSchema>;

export const IndicatorUpdateSchema = z.strictObject({
  instanceId: z.string().min(1).max(100), barTime: z.number().int(), values: z.record(z.string(), z.number().nullable()), seq: z.number().int().nonnegative(),
});
export type IndicatorUpdate = z.infer<typeof IndicatorUpdateSchema>;
