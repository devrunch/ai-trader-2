import type { ErrorCode } from '@aitrader/contracts';
export class ApiError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly status: number,
    readonly requestId?: string,
    readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
  }
}
export function isRetryable(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'UNAVAILABLE' || err.code === 'PROVIDER_DOWN');
}
