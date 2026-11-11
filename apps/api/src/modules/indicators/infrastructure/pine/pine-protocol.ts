import { z } from 'zod';

/** PineTS's candle shape. */
const CandleSchema = z.object({ openTime: z.number(), closeTime: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() });
export type Candle = z.infer<typeof CandleSchema>;

const PlotRowSchema = z.record(z.string(), z.number().nullable());
export type PlotRow = z.infer<typeof PlotRowSchema>;

const InputValues = z.record(z.string(), z.union([z.number(), z.boolean(), z.string()]));

/** Host → worker. `ref` pairs a request with its reply. */
export const HostMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('describe'), ref: z.number(), source: z.string() }),
  z.object({ type: z.literal('open'), ref: z.number(), instance: z.number(), source: z.string(), inputs: InputValues,
    symbol: z.string(), timeframe: z.string(), timezone: z.string(), session: z.string(), candles: z.array(CandleSchema) }),
  z.object({ type: z.literal('tick'), ref: z.number(), instance: z.number(), candle: CandleSchema, replace: z.boolean() }),
  z.object({ type: z.literal('close'), instance: z.number() }),
  z.object({ type: z.literal('candles'), fetch: z.number(), candles: z.array(CandleSchema), reason: z.string().optional() }),
]);
export type HostMessage = z.infer<typeof HostMessageSchema>;

const MetaSchema = z.object({
  title: z.string(), shortTitle: z.string(), overlay: z.boolean(),
  inputs: z.array(z.object({ type: z.string(), title: z.string(), defval: z.unknown(), tooltip: z.string().optional(), group: z.string().optional(),
    minval: z.number().optional(), maxval: z.number().optional(), step: z.number().optional(), options: z.array(z.string()).optional() })),
  plots: z.array(z.object({ key: z.string(), title: z.string(), style: z.string().optional() })),
  levels: z.array(z.object({ title: z.string(), value: z.number() })),
});

/** Worker → host. */
export const WorkerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('meta'), ref: z.number(), meta: MetaSchema }),
  z.object({ type: z.literal('rows'), ref: z.number(), rows: z.array(PlotRowSchema), reason: z.string().optional() }),
  z.object({ type: z.literal('error'), ref: z.number(), message: z.string() }),
  /** A script asked `request.security` for other data; the host answers with `candles`. */
  z.object({ type: z.literal('fetch'), fetch: z.number(), instance: z.number(), symbol: z.string(), timeframe: z.string(), from: z.number().optional(), to: z.number().optional() }),
]);
export type WorkerMessage = z.infer<typeof WorkerMessageSchema>;
