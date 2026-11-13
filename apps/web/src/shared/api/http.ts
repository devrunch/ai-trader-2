import { ErrorBodySchema, type ErrorCode } from '@aitrader/contracts';
import { z } from 'zod';
import { ApiError } from './api-error';
type Options<T> = { schema: z.ZodType<T>; method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal };
function statusCode(status: number): ErrorCode {
  switch (status) {
    case 404: return 'NOT_FOUND';
    case 429: return 'RATE_LIMITED';
    case 503: return 'UNAVAILABLE';
    default: return 'INTERNAL';
  }
}
async function readBody(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
/** Absolute API URL for a path, for clients that do their own fetching (the chat stream). */
export function apiUrl(path: string): string {
  return z.string().catch('/api').parse(import.meta.env.VITE_API_URL).replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}
/** Headers every mutating request carries (CSRF guard). */
export const API_HEADERS = { 'X-Requested-With': 'aitrader' } as const;

/** Fired when a request is refused for a missing or expired session, so the shell can send the user to sign in. */
export const SESSION_EXPIRED = 'aitrader:session-expired';

export async function apiFetch<T>(path: string, opts: Options<T>): Promise<T> {
  const timeout = AbortSignal.timeout(15_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: opts.method ?? 'GET', credentials: 'include', signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...API_HEADERS },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    });
  } catch (error) {
    if (error instanceof TypeError) throw new ApiError('UNAVAILABLE', 'Unable to reach the server', 0);
    throw error;
  }
  const body = await readBody(response);
  if (response.status === 401 && !path.includes('/auth/')) window.dispatchEvent(new Event(SESSION_EXPIRED));
  if (!response.ok) {
    const parsed = ErrorBodySchema.safeParse(body);
    if (parsed.success) {
      const { code, message, requestId, details } = parsed.data;
      throw new ApiError(code, message, response.status, requestId, details);
    }
    throw new ApiError(statusCode(response.status), 'Request failed', response.status);
  }
  const parsed = opts.schema.safeParse(body);
  if (!parsed.success) throw new ApiError('INTERNAL', 'Unexpected response shape', response.status);
  return parsed.data;
}
