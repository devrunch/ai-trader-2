import { z } from 'zod';
import type { Bar } from '../../domain/bar';
import type { ProviderResult } from '../../application/ports/market-data-provider';

const quote = z.object({ date: z.date(), open: z.number().nullable(), high: z.number().nullable(), low: z.number().nullable(), close: z.number().nullable(), volume: z.number().nullable().optional() });
const chart = z.object({ quotes: z.array(quote) });
const failure = z.object({ status: z.number().optional(), statusCode: z.number().optional(), code: z.union([z.string(), z.number()]).optional(), message: z.string().optional() });
export function yahooSymbol(symbol: string): string { return symbol === 'BRK.B' ? 'BRK-B' : symbol; }
export function yahooBars(payload: unknown): Bar[] {
  return chart.parse(payload).quotes.flatMap(row => row.open === null || row.high === null || row.low === null || row.close === null ? []
    : [{ time: row.date.getTime(), open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume ?? null }]);
}
export function yahooFailure(error: unknown): Extract<ProviderResult<never>, { ok: false }> {
  const parsed = failure.safeParse(error); const value = parsed.success ? parsed.data : {};
  const status = value.status ?? value.statusCode ?? (typeof value.code === 'number' ? value.code : undefined);
  if (status === 429) return { ok: false, reason: 'RATE_LIMITED', retryAfterMs: 60000 };
  if (status === 404 || /Not Found|No data found|Quote not found|delisted/i.test(`${String(value.code ?? '')} ${value.message ?? ''}`)) return { ok: false, reason: 'UNSUPPORTED' };
  return { ok: false, reason: 'PROVIDER_DOWN' };
}
