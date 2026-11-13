import { withTimeout } from '@aitrader/resilience';
import { UnavailableError } from '../errors';

/** Runs a Redis operation under a 3 s timeout and the caller's signal; any failure becomes `UnavailableError(what)`. */
export async function redisCall<T>(what: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try { return await withTimeout(async abort => { abort.throwIfAborted(); return operation(); }, 3000, signal); }
  catch { throw new UnavailableError(what); }
}
