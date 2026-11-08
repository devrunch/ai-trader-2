import { backoffDelay } from './backoff.js';
import { AbortedError } from './errors.js';

function checkSignal(signal: AbortSignal): void {
  if (signal.aborted) throw new AbortedError();
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new AbortedError()); return; }
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(new AbortedError()); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function retry<T>(
  fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  opts: {
    retries: number; baseMs: number; maxMs: number;
    retryOn?: (err: unknown) => boolean; signal?: AbortSignal;
    random?: () => number; onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  },
): Promise<T> {
  const signal = opts.signal ?? new AbortController().signal;
  for (let attempt = 0; ; attempt++) {
    checkSignal(signal);
    try {
      return await fn(attempt, signal);
    } catch (err: unknown) {
      if (err instanceof AbortedError) throw err;
      checkSignal(signal);
      if (attempt >= opts.retries || opts.retryOn?.(err) === false) throw err;
      const delayMs = backoffDelay(attempt, opts);
      opts.onRetry?.(err, attempt, delayMs);
      await sleep(delayMs, signal);
    }
  }
}
