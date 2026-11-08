import { DomainError } from './domain-error';

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 422;
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
