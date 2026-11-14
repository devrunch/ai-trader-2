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
export const NEWS_MARKETS = ['forex', 'india', 'us', 'commodities', 'crypto'] as const;
export type NewsMarket = (typeof NEWS_MARKETS)[number];
export const SENTIMENT_LABELS = ['bullish', 'bearish', 'neutral'] as const;
/** Sentiment of one headline: a label and a score in [-1, 1]; `by` says what scored it. */
export const SentimentSchema = z.strictObject({ label: z.enum(SENTIMENT_LABELS), score: z.number().min(-1).max(1), by: z.enum(['llm', 'finbert', 'rules', 'vendor']) });
export type Sentiment = z.infer<typeof SentimentSchema>;
/** Stored beside a headline: its markets, its sentiment, and whether it is crowd chatter (not journalism). */
export const NewsItemExtraSchema = z.strictObject({ markets: z.array(z.enum(NEWS_MARKETS)).optional(), sentiment: SentimentSchema.nullable().optional(), crowd: z.boolean().optional(), /** Set on cluster leads: distinct sources that reported the story. */ sourceCount: z.number().int().positive().optional() });
export const NewsItemFullSchema = NewsItemSchema.extend(NewsItemExtraSchema.shape);
export type NewsItemFull = z.infer<typeof NewsItemFullSchema>;
/** The same story from several sources. */
export const NewsClusterSchema = z.strictObject({
  id: z.string(), lead: NewsItemFullSchema, sourceCount: z.number().int().positive(), sources: z.array(z.string()),
  items: z.array(z.string()), symbols: z.array(z.string()), markets: z.array(z.enum(NEWS_MARKETS)), sentiment: SentimentSchema.nullable(), firstSeen: z.string(), lastSeen: z.string(),
});
export type NewsCluster = z.infer<typeof NewsClusterSchema>;
export const SentimentTrendSchema = z.strictObject({
  scope: z.string(), asOf: z.string(),
  windows: z.array(z.strictObject({ hours: z.number(), items: z.number().int(), score: z.number().nullable(), bullish: z.number().int(), bearish: z.number().int(), neutral: z.number().int() })),
});
export type SentimentTrend = z.infer<typeof SentimentTrendSchema>;
export const SentimentQuerySchema = z.object({ symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/).optional(), market: z.enum(NEWS_MARKETS).optional() })
  .refine(q => Boolean(q.symbol) !== Boolean(q.market), 'give a symbol or a market, not both');
export const EmailPrefSchema = z.strictObject({ reports: z.boolean(), address: z.email().max(200).optional() });
export const NewsResponseSchema = z.strictObject({ items: z.array(NewsItemFullSchema), clusters: z.array(NewsClusterSchema).optional() });
export const NewsQuerySchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/).optional(),
  hours: z.coerce.number().int().min(1).max(24 * 14).default(48),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  minImpact: z.enum(NEWS_IMPACTS).optional(),
  market: z.enum(NEWS_MARKETS).optional(),
  /** Group the same story from several sources into one entry. */
  clustered: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  crowd: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
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

/** The markets a headline belongs to: from the instruments it names, the asset classes it moves, and the markets its source covers. */
export function marketsFor(symbols: string[], moves: string[], sourceMarkets: readonly NewsMarket[] = []): NewsMarket[] {
  const out = new Set<NewsMarket>();
  for (const s of [...symbols, ...moves]) {
    const [exchange = '', ticker = ''] = s.split(':');
    if (exchange === 'NSE' || exchange === 'BSE') out.add('india');
    else if (exchange === 'MCX') { out.add('india'); out.add('commodities'); }
    else if (exchange === 'NASDAQ' || exchange === 'NYSE' || s === 'US stocks') out.add('us');
    else if (exchange === 'FX') { out.add('forex'); if (ticker.includes('INR')) out.add('india'); }
    else if (exchange === 'OANDA') out.add(/^X(AU|AG|PT)|^(WTI|BCO)/.test(ticker) ? 'commodities' : 'forex');
    else if (exchange === 'CRYPTO') out.add('crypto');
  }
  if (out.size === 0) for (const m of sourceMarkets) out.add(m);
  return [...out];
}
