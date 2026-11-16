import { Writable } from 'node:stream';
import type { Redis } from 'ioredis';
import { RecentLogsQuerySchema, RecentLogsResponseSchema, type RecentLogsResponse } from '@aitrader/contracts';

/** The newest warning and error lines of every API process, for Admin and the ops read endpoints (container logs are not reachable from outside). */
export const RECENT_LOGS_KEY = 'ops:logs';
const MAX_LINES = 1000;
const MAX_LINE_CHARS = 2000;

/** Masks credentials that can appear inside messages (URLs with keys, bearer tokens). */
export function maskSecrets(line: string): string {
  return line
    .replace(/((?:api_?key|apikey|token|access_token|secret|password)=)[^&\s"']+/gi, '$1***')
    .replace(/(bearer\s+)[A-Za-z0-9._-]+/gi, '$1***');
}

/** A pino destination that keeps warn and above in a capped Redis list, tagged with the process name. Writing never throws or logs. */
export function recentLogStream(redis: Pick<Redis, 'multi'>, service: string): Writable {
  return new Writable({
    write(chunk: Buffer | string, _encoding, done) {
      const line = maskSecrets(String(chunk).trim()).slice(0, MAX_LINE_CHARS);
      if (line) {
        const tagged = line.startsWith('{') ? `{"service":${JSON.stringify(service)},${line.slice(1)}` : JSON.stringify({ service, msg: line });
        void redis.multi().lpush(RECENT_LOGS_KEY, tagged).ltrim(RECENT_LOGS_KEY, 0, MAX_LINES - 1).exec().catch(() => undefined);
      }
      done();
    },
  });
}

export interface RecentLog { time: string | null; level: string; service: string; msg: string; context: Record<string, unknown> }
const LEVELS: Readonly<Record<number, string>> = { 40: 'warn', 50: 'error', 60: 'fatal' };
const OWN_KEYS = new Set(['service', 'level', 'time', 'msg', 'message', 'pid', 'hostname']);
const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

/** The newest lines first, parsed; `contains` filters on the raw line. */
export async function readRecentLogs(redis: Pick<Redis, 'lrange'>, limit: number, contains?: string): Promise<RecentLog[]> {
  const raw = await redis.lrange(RECENT_LOGS_KEY, 0, MAX_LINES - 1);
  const needle = contains?.toLowerCase();
  return raw.filter(line => !needle || line.toLowerCase().includes(needle)).slice(0, limit).map(line => {
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      const { service, level, time, msg, message } = record;
      const context = Object.fromEntries(Object.entries(record).filter(([k]) => !OWN_KEYS.has(k)));
      return { time: typeof time === 'number' ? new Date(time).toISOString() : null, level: typeof level === 'number' ? LEVELS[level] ?? String(level) : text(level) || 'warn',
        service: text(service), msg: text(msg) || text(message), context };
    } catch { return { time: null, level: 'warn', service: '', msg: line, context: {} }; }
  });
}

/** The logs endpoints' answer: `limit` and `contains` from the query string, newest first. */
export async function recentLogsResponse(redis: Pick<Redis, 'lrange'>, rawQuery: unknown): Promise<RecentLogsResponse> {
  const q = RecentLogsQuerySchema.parse(rawQuery);
  return RecentLogsResponseSchema.parse({ logs: await readRecentLogs(redis, q.limit, q.contains) });
}
