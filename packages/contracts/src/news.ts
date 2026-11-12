import { z } from 'zod';

export const NEWS_IMPACTS = ['high', 'medium', 'low'] as const;
export const NEWS_DIRECTIONS = ['up', 'down', 'unclear'] as const;
/** Impact, the instruments or asset classes a headline likely moves, and a direction only when a rule is explicit. */
export const NewsItemSchema = z.strictObject({
  id: z.string(), source: z.string(), title: z.string(), url: z.url(), summary: z.string().nullable(),
  publishedAt: z.string(), symbols: z.array(z.string()),
  impact: z.enum(NEWS_IMPACTS), moves: z.array(z.string()), direction: z.enum(NEWS_DIRECTIONS).nullable(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;
export type NewsImpact = (typeof NEWS_IMPACTS)[number];
export const NewsResponseSchema = z.strictObject({ items: z.array(NewsItemSchema) });
export const NewsQuerySchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/).optional(),
  hours: z.coerce.number().int().min(1).max(24 * 14).default(48),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  minImpact: z.enum(NEWS_IMPACTS).optional(),
});

export const NOTIFICATION_KINDS = ['task', 'fill', 'system', 'alert'] as const;
/** Where a notification leads: a chat thread or a symbol on the chart. */
export const NotificationLinkSchema = z.strictObject({ threadId: z.uuid().optional(), symbol: z.string().optional() });
export const NotificationSchema = z.strictObject({
  id: z.uuid(), kind: z.enum(NOTIFICATION_KINDS), title: z.string(), body: z.string().nullable(), link: NotificationLinkSchema.nullable(),
  createdAt: z.string(), read: z.boolean(),
});
export type NotificationDto = z.infer<typeof NotificationSchema>;
export const NotificationsResponseSchema = z.strictObject({ items: z.array(NotificationSchema), unread: z.number().int().nonnegative() });
export const NotificationsReadSchema = z.strictObject({ ids: z.array(z.uuid()).max(200).optional() });
