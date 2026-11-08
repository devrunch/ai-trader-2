import { randomUUID } from 'node:crypto';

export function resolveRequestId(header: string | string[] | undefined): string {
  return typeof header === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(header) ? header : randomUUID();
}
