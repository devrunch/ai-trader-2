import { createHash } from 'node:crypto';

/** SHA-256 (hex) of the exact source text; equal hashes mean an identical save (FR-IN-28). */
export function hashSource(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}
