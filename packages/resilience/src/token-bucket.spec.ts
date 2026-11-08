import { expect, it } from 'vitest';
import { TokenBucket } from './token-bucket.js';

// NFR-SC-5: deterministic rate limiting with fractional refill.
function fixture() {
  let now = 0;
  return { bucket: new TokenBucket({ capacity: 5, refillPerSec: 2, now: () => now }), advance: (ms: number) => { now += ms; } };
}
it('starts full', () => {
  const { bucket } = fixture();
  expect(bucket.tryTake(5)).toBe(true);
  expect(bucket.tryTake()).toBe(false);
});
it('refills at rate and caps at capacity', () => {
  const { bucket, advance } = fixture();
  bucket.tryTake(5);
  advance(250);
  expect(bucket.tryTake()).toBe(false);
  advance(250);
  expect(bucket.tryTake()).toBe(true);
  advance(10000);
  expect(bucket.tryTake(5)).toBe(true);
  expect(bucket.tryTake()).toBe(false);
});
it('msUntil is 0 when tokens available', () => {
  expect(fixture().bucket.msUntil()).toBe(0);
});
it('msUntil reports the wait', () => {
  const { bucket, advance } = fixture();
  bucket.tryTake(5);
  advance(125);
  expect(bucket.msUntil()).toBe(375);
  expect(bucket.msUntil(2)).toBe(875);
});
it('msUntil is Infinity above capacity', () => {
  expect(fixture().bucket.msUntil(6)).toBe(Infinity);
});
