import type { Redis } from 'ioredis';
import { withTimeout } from '@aitrader/resilience';
import type { WindowLimiter } from '../application/chat-service';

const script = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return n
`;

/** Fixed-window counter shared across API instances. */
export class RedisWindowLimiter implements WindowLimiter {
  constructor(private readonly redis: Redis) {}
  async take(key: string, limit: number, windowMs: number): Promise<boolean> {
    const count = await withTimeout(() => this.redis.eval(script, 1, `rl:${key}`, windowMs), 2000);
    return Number(count) <= limit;
  }
}
