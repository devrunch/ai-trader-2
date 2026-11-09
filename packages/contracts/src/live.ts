import { z } from 'zod';
import { BarSchema, DataStatusSchema, INTERVALS } from './market-data.js';

export const LiveSubscribeSchema = z.strictObject({ symbol: z.string().min(1).max(100), interval: z.enum(INTERVALS), afterSeq: z.number().int().nonnegative().optional() });
export const LiveUnsubscribeSchema = z.strictObject({ subscriptionId: z.uuid() });
export const LiveAckSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), subscriptionId: z.uuid() }),
  z.strictObject({ ok: z.literal(false), code: z.enum(['LIMIT', 'NOT_FOUND', 'INVALID']), message: z.string() }),
]);
export const LiveSnapshotSchema = z.strictObject({ subscriptionId: z.uuid(), instrumentId: z.string(), interval: z.enum(INTERVALS), bars: z.array(BarSchema), seq: z.number().int().nonnegative(), status: DataStatusSchema });
export const LiveBarSchema = z.strictObject({ subscriptionId: z.uuid(), seq: z.number().int().positive(), kind: z.enum(['forming', 'closed']), bar: BarSchema });
export const LiveStatusSchema = z.strictObject({ subscriptionId: z.uuid(), status: DataStatusSchema });
export const LiveResyncSchema = z.strictObject({ subscriptionId: z.uuid(), reason: z.enum(['SEQ_GAP', 'UPSTREAM_RECONNECT', 'SLOW_CONSUMER']) });
export type LiveSubscribe = z.infer<typeof LiveSubscribeSchema>;
