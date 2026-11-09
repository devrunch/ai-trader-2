import { z } from 'zod';
import { INTERVALS } from '@aitrader/contracts';
import type { BarsCursor } from '../application';

const epochMs = z.string().regex(/^\d{1,15}$/).transform(Number);

const BarsQuerySchema = z.object({
  symbol: z.string().trim().min(3).max(80),
  interval: z.enum(INTERVALS),
  limit: z.string().regex(/^\d{1,4}$/).transform(Number).pipe(z.number().int().min(1).max(5000)).default(500),
  before: epochMs.optional(),
  since: epochMs.optional(),
}).refine(q => q.before === undefined || q.since === undefined, { message: 'Use either before or since', path: ['since'] });

export function parseBarsQuery(raw: unknown): { symbol: string; interval: (typeof INTERVALS)[number]; cursor: BarsCursor; limit: number } {
  const q = BarsQuerySchema.parse(raw);
  const cursor: BarsCursor = q.before !== undefined ? { before: q.before } : q.since !== undefined ? { since: q.since } : { latest: true };
  return { symbol: q.symbol, interval: q.interval, cursor, limit: q.limit };
}
