import type { Redis } from 'ioredis';
import { sleep, TimeoutError, withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import { RateLimitedError } from '../errors';

// Redis time and one atomic script share refill accounting across processes.
const takeScript = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + tonumber(clock[2]) / 1000
local capacity, rate = tonumber(ARGV[1]), tonumber(ARGV[2])
local state = redis.call('HMGET', KEYS[1], 'tokens', 'at')
local tokens = tonumber(state[1]) or capacity
local at = tonumber(state[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - at) * rate / 1000)
local wait = 0
if tokens >= 1 then tokens = tokens - 1
else wait = math.ceil((1 - tokens) * 1000 / rate) end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'at', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity * 1000 / rate) + 1000)
return wait
`;

export class RedisTokenBucket {
  constructor(private readonly redis: Redis, private readonly key: string, private readonly capacity: number,
    private readonly refillPerSec: number) {
    if (!Number.isFinite(capacity) || capacity < 1 || !Number.isFinite(refillPerSec) || refillPerSec <= 0) {
      throw new RangeError('Token bucket requires capacity >= 1 and refillPerSec > 0');
    }
  }

  async take(signal: AbortSignal, maxWaitMs = 30000): Promise<void> {
    if (!Number.isFinite(maxWaitMs) || maxWaitMs < 0) throw new RangeError('maxWaitMs must be nonnegative');
    const deadline = performance.now() + maxWaitMs;
    for (;;) {
      signal.throwIfAborted();
      const remaining = Math.max(0, deadline - performance.now());
      let response: unknown;
      try {
        response = await withTimeout(() => this.redis.eval(takeScript, 1, this.key, this.capacity, this.refillPerSec),
          Math.min(1000, Math.max(1, remaining)), signal);
      } catch (error) {
        if (error instanceof TimeoutError && performance.now() >= deadline) {
          throw new RateLimitedError('History rate limit wait exceeded', 1000);
        }
        throw error;
      }
      const wait = z.number().nonnegative().parse(response);
      if (wait === 0) return;
      if (wait > deadline - performance.now()) {
        await sleep(Math.max(0, deadline - performance.now()), signal);
        throw new RateLimitedError('History rate limit wait exceeded', wait);
      }
      await sleep(wait, signal);
    }
  }
}
