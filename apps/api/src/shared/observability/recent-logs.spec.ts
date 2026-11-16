import { describe, expect, it } from 'vitest';
import { maskSecrets, readRecentLogs, recentLogStream, RECENT_LOGS_KEY } from './recent-logs';

function fakeRedis() {
  const list: string[] = [];
  return { list, multi: () => {
    const ops: Array<() => void> = [];
    const chain = { lpush: (_k: string, v: string) => { ops.push(() => list.unshift(v)); return chain; }, ltrim: (_k: string, _a: number, end: number) => { ops.push(() => list.splice(end + 1)); return chain; },
      exec: () => { ops.forEach(op => { op(); }); return Promise.resolve([]); } };
    return chain;
  }, lrange: (key: string) => Promise.resolve(key === RECENT_LOGS_KEY ? [...list] : []) };
}

describe('recent logs', () => {
  it('masks keys and tokens inside messages', () => {
    expect(maskSecrets('GET https://x.io/q?apikey=ABC123&symbol=AAPL failed')).toBe('GET https://x.io/q?apikey=***&symbol=AAPL failed');
    expect(maskSecrets('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer ***');
  });

  it('keeps tagged lines newest first and reads them back parsed and filtered', async () => {
    const redis = fakeRedis();
    const stream = recentLogStream(redis as never, 'api');
    stream.write(`${JSON.stringify({ level: 40, time: Date.parse('2026-11-16T03:37:04Z'), msg: 'job failed', job: 'calendar-refresh', error: 'HTTP 403' })}\n`);
    stream.write(`${JSON.stringify({ level: 50, time: Date.parse('2026-11-16T03:38:00Z'), msg: 'boom' })}\n`);
    await new Promise(resolve => setImmediate(resolve));
    const logs = await readRecentLogs(redis, 10);
    expect(logs.map(l => l.msg)).toEqual(['boom', 'job failed']);
    expect(logs[1]).toMatchObject({ service: 'api', level: 'warn', time: '2026-11-16T03:37:04.000Z', context: { job: 'calendar-refresh', error: 'HTTP 403' } });
    expect((await readRecentLogs(redis as never, 10, 'calendar')).map(l => l.msg)).toEqual(['job failed']);
  });
});
