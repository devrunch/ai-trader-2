import { AbortedError, TimeoutError } from './errors.js';

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  if (parent?.aborted) {
    controller.abort();
    throw new AbortedError();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    abort = () => {
      reject(new AbortedError());
      controller.abort();
    };
    parent?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => {
      reject(new TimeoutError());
      controller.abort();
    }, ms);
  });
  try {
    return await Promise.race([deadline, fn(controller.signal)]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
  }
}
