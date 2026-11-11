/** Highest version number to delete so that only the newest `keep` versions remain once `newest` is stored (0 = none). */
export function dropUpTo(newest: number, keep: number): number {
  return Math.max(0, newest - keep);
}
