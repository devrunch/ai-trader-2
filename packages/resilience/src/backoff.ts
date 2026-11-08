export function backoffDelay(
  attempt: number,
  opts: { baseMs: number; maxMs: number; random?: () => number },
): number {
  return Math.floor((opts.random ?? Math.random)() * Math.min(opts.maxMs, opts.baseMs * 2 ** attempt));
}
