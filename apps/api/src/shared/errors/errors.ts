import { DomainError } from './domain-error';
import type { ErrorCode } from '@aitrader/contracts';

export class NotFoundError extends DomainError {
  readonly code: ErrorCode = 'NOT_FOUND';
  readonly httpStatus = 404;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 422;
}

export class BadRequestValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 400;
}

export class SymbolNotFoundError extends NotFoundError {
  override readonly code = 'SYMBOL_NOT_FOUND';
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
}

export class RateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED';
  readonly httpStatus = 429;
  constructor(message: string, readonly retryAfterMs: number, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class UnavailableError extends DomainError {
  readonly code = 'UNAVAILABLE';
  readonly httpStatus = 503;
}

export class ProviderDownError extends DomainError {
  readonly code = 'PROVIDER_DOWN';
  readonly httpStatus = 503;
}

/** A readable message from anything thrown: an Error, a vendor's plain error object ({ message, error_type }) or a string. */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const o = error as Record<string, unknown>;
    const parts = [o.error_type, o.status, o.message].filter(v => typeof v === 'string' || typeof v === 'number').map(String);
    if (parts.length) return parts.join(': ');
    try { return JSON.stringify(error).slice(0, 200); } catch { return 'unknown error'; }
  }
  return String(error);
}
