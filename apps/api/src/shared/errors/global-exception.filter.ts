import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { ErrorBody, ErrorCode } from '@aitrader/contracts';
import { ZodError } from 'zod';
import { DomainError } from './domain-error';
import { RateLimitedError } from './errors';

interface ErrorRequest {
  id?: unknown;
  headers: Record<string, unknown>;
}
interface ErrorResponse {
  setHeader(name: string, value: string): void;
  status(status: number): ErrorResponse;
  json(body: ErrorBody): void;
}
const statusCodes: Readonly<Partial<Record<number, ErrorCode>>> = {
  400: 'VALIDATION_FAILED', 422: 'VALIDATION_FAILED', 401: 'UNAUTHORIZED',
  403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 429: 'RATE_LIMITED', 503: 'UNAVAILABLE',
};

function publicError(error: unknown): { status: number; body: Omit<ErrorBody, 'requestId'> } {
  if (error instanceof DomainError) {
    return { status: error.httpStatus, body: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } };
  }
  if (error instanceof ZodError) {
    return { status: 422, body: { code: 'VALIDATION_FAILED', message: 'Validation failed', details: {
      fields: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
    } } };
  }
  if (error instanceof HttpException) {
    const status = error.getStatus();
    return { status, body: { code: statusCodes[status] ?? 'INTERNAL', message: status >= 500 ? 'Internal error' : error.message } };
  }
  return { status: 500, body: { code: 'INTERNAL', message: 'Internal error' } };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<ErrorRequest>();
    const response = http.getResponse<ErrorResponse>();
    const header = request.headers['x-request-id'];
    const requestId = typeof request.id === 'string' && request.id.length > 0
      ? request.id : typeof header === 'string' && header.length > 0 ? header : 'unknown';
    const { status, body } = publicError(error);
    if (error instanceof DomainError) this.logger.warn({ ...body, requestId });
    else if (status >= 500) this.logger.error({ code: body.code, requestId }, error instanceof Error ? error.stack : undefined);
    else this.logger.warn({ ...body, requestId });
    if (error instanceof RateLimitedError) response.setHeader('Retry-After', String(Math.ceil(error.retryAfterMs / 1000)));
    response.status(status).json({ ...body, requestId });
  }
}
