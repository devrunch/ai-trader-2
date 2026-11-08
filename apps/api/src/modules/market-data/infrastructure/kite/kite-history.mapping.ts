import { z } from 'zod';
import { CircuitOpenError } from '@aitrader/resilience';
import { RateLimitedError } from '../../../../shared/errors';
import type { Bar } from '../../domain/bar';
import type { ProviderResult } from '../../application/ports/market-data-provider';

const timestamp = z.union([z.date(), z.string().transform(value => {
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(' ', 'T')}+05:30`;
  return new Date(zoned);
})]).transform(date => date.getTime()).pipe(z.number());
const candle = z.object({ date: timestamp, open: z.number(), high: z.number(),
  low: z.number(), close: z.number(), volume: z.number().nonnegative() });

export function kiteBars(payload: unknown, noVolume: boolean): Bar[] {
  return z.array(candle).parse(payload).map(row => ({ time: row.date, open: row.open, high: row.high,
    low: row.low, close: row.close, volume: noVolume ? null : row.volume }));
}

export function kiteRequestTime(at: number): string {
  return new Date(at + 19800000).toISOString().slice(0, 19).replace('T', ' ');
}

const errorShape = z.object({ error_type: z.string().optional(), status: z.number().optional(),
  statusCode: z.number().optional(), message: z.string().optional() });
export function kiteFailure(error: unknown): Extract<ProviderResult<never>, { ok: false }> {
  if (error instanceof CircuitOpenError) return { ok: false, reason: 'PROVIDER_DOWN', retryAfterMs: error.retryAfterMs };
  if (error instanceof RateLimitedError) return { ok: false, reason: 'RATE_LIMITED', retryAfterMs: error.retryAfterMs };
  const parsed = errorShape.safeParse(error);
  if (parsed.success) {
    const value = parsed.data;
    if (value.error_type === 'TokenException') return { ok: false, reason: 'AUTH_EXPIRED' };
    if (value.status === 429 || value.statusCode === 429 ||
      (value.error_type === 'NetworkException' && /too many/i.test(value.message ?? ''))) {
      return { ok: false, reason: 'RATE_LIMITED', retryAfterMs: 1000 };
    }
    if (value.error_type === 'InputException' && /(?:unknown|invalid|not found).*instrument|instrument.*(?:unknown|invalid|not found)/i.test(value.message ?? '')) {
      return { ok: false, reason: 'UNSUPPORTED' };
    }
  }
  return { ok: false, reason: 'PROVIDER_DOWN' };
}
