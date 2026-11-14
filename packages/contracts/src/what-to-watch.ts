import { z } from 'zod';

const SymbolId = z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/);

/** A level the user can follow: following an item creates a task that watches it. */
export const WatchFollowSchema = z.strictObject({ symbol: SymbolId, op: z.enum(['above', 'below']), value: z.number().positive() });

/** What the model writes for one item. */
export const WatchItemDraftSchema = z.strictObject({
  title: z.string().trim().min(5).max(120),
  why: z.string().trim().min(10).max(400),
  symbols: z.array(SymbolId).min(1).max(4),
  direction: z.enum(['up', 'down', 'volatile', 'watch']),
  confidence: z.number().min(0).max(1),
  horizon: z.enum(['today', 'this week']),
  follow: WatchFollowSchema.nullable(),
});
export const WatchDraftSchema = z.strictObject({ items: z.array(WatchItemDraftSchema).min(1).max(8) });

/** One item as stored and shown: the draft plus the prices when it was written and how it turned out. */
export const WatchItemSchema = z.strictObject({
  ...WatchItemDraftSchema.shape,
  id: z.string(),
  refPrices: z.record(z.string(), z.number()),
  outcome: z.enum(['open', 'right', 'wrong', 'unclear']),
  movePct: z.number().nullable(),
  resolvedAt: z.string().nullable(),
  /** The task created when the user followed it. */
  taskId: z.string().nullable(),
});
export type WatchItem = z.infer<typeof WatchItemSchema>;

export const WhatToWatchSchema = z.strictObject({
  id: z.string(), createdAt: z.string(), items: z.array(WatchItemSchema),
  /** How past items turned out (resolved ones only), for the track record line. */
  record: z.strictObject({ right: z.number().int(), wrong: z.number().int(), total: z.number().int() }),
});
export type WhatToWatchDto = z.infer<typeof WhatToWatchSchema>;
export const WhatToWatchResponseSchema = z.strictObject({ list: WhatToWatchSchema.nullable(), canRefreshAt: z.string().nullable() });
export type WhatToWatchResponse = z.infer<typeof WhatToWatchResponseSchema>;
