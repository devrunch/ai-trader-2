import { z } from 'zod';
import { ValidationError } from '../../../../../shared/errors/index.js';

const rowSchema = z.object({
  instrument_token: z.string().regex(/^\d+$/), exchange_token: z.string().regex(/^\d+$/),
  tradingsymbol: z.string(), name: z.string(), expiry: z.string(),
  strike: z.coerce.number(), tick_size: z.coerce.number().nonnegative(), lot_size: z.coerce.number().int().nonnegative(),
  instrument_type: z.string(), segment: z.string(), exchange: z.string(),
});
export type KiteRow = z.infer<typeof rowSchema>;

// RFC 4180 state machine keeps quoted delimiters, escaped quotes and embedded newlines.
function records(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
      row.push(field); field = '';
      if (char !== ',') {
        if (row.some((value) => value.length > 0)) result.push(row);
        row = [];
        if (char === '\r' && text[index + 1] === '\n') index++;
      }
    } else field += char ?? '';
  }
  if (quoted) throw new ValidationError('Unterminated instrument CSV field');
  if (field || row.length) { row.push(field); result.push(row); }
  return result;
}

export function parseKiteCsv(text: string): KiteRow[] {
  const [header, ...rows] = records(text);
  if (!header) throw new ValidationError('Missing instrument CSV header');
  return rows.map((cells) => {
    const parsed = rowSchema.safeParse(Object.fromEntries(header.map((key, index) => [key, cells[index]])));
    if (!parsed.success) throw new ValidationError('Invalid instrument CSV row');
    return parsed.data;
  });
}
