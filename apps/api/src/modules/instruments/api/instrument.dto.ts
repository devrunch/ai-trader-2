import { z } from 'zod';
import { INSTRUMENT_TYPES, InstrumentSchema } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors/index.js';
import type { ResolvedInstrument } from '../application/index.js';

const SearchQuerySchema = z.strictObject({
  q: z.string().trim().max(64).default(''), exchange: z.string().regex(/^[A-Z0-9_]{1,20}$/).optional(),
  type: z.enum(INSTRUMENT_TYPES).optional(), limit: z.coerce.number().int().min(1).max(50).default(20),
});
export function parseSearchQuery(raw: unknown) {
  const parsed = SearchQuerySchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError('Invalid instrument search query', { issues: parsed.error.issues });
  return parsed.data;
}
export function resolvedResponse(resolved: ResolvedInstrument) {
  const i = resolved.instrument;
  return { ...resolved, instrument: InstrumentSchema.parse({ ...i, id: String(i.id),
    ...(i.underlying ? { underlying: String(i.underlying) } : {}) }) };
}
