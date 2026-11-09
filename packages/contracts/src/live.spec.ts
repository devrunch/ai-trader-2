import { describe, expect, it } from 'vitest';
import { LiveAckSchema, LiveBarSchema, LiveResyncSchema, LiveSnapshotSchema, LiveStatusSchema, LiveSubscribeSchema, LiveUnsubscribeSchema } from './live.js';

const id = '00000000-0000-4000-8000-000000000001';
const bar = { time: 1, open: 1, high: 2, low: 0, close: 1, volume: 1 };

describe('live socket contracts (FR-LS-1, NFR-SC-1)', () => {
  it('validates strict subscribe and unsubscribe payloads', () => {
    expect(LiveSubscribeSchema.parse({ symbol: 'NSE:TEST', interval: '5', afterSeq: 12 })).toEqual({ symbol: 'NSE:TEST', interval: '5', afterSeq: 12 });
    expect(LiveSubscribeSchema.safeParse({ symbol: 'NSE:TEST', interval: '5', unexpected: true }).success).toBe(false);
    expect(LiveUnsubscribeSchema.safeParse({ subscriptionId: id }).success).toBe(true);
    expect(LiveUnsubscribeSchema.safeParse({ subscriptionId: id, extra: true }).success).toBe(false);
  });

  it('validates ack success and error shapes', () => {
    expect(LiveAckSchema.safeParse({ ok: true, subscriptionId: id }).success).toBe(true);
    expect(LiveAckSchema.safeParse({ ok: false, code: 'LIMIT', message: 'limited' }).success).toBe(true);
    expect(LiveAckSchema.safeParse({ ok: false, code: 'SECRET', message: 'bad' }).success).toBe(false);
  });

  it('validates snapshot, bar, status and resync events strictly', () => {
    const snapshot = { subscriptionId: id, instrumentId: 'NSE:TEST', interval: '1', bars: [bar], seq: 1, status: { state: 'ok' } };
    expect(LiveSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(LiveSnapshotSchema.safeParse({ ...snapshot, hidden: 'data' }).success).toBe(false);
    expect(LiveBarSchema.safeParse({ subscriptionId: id, seq: 2, kind: 'closed', bar }).success).toBe(true);
    expect(LiveStatusSchema.safeParse({ subscriptionId: id, status: { state: 'stale', reason: 'PROVIDER_DOWN' } }).success).toBe(true);
    expect(LiveResyncSchema.safeParse({ subscriptionId: id, reason: 'SEQ_GAP' }).success).toBe(true);
    expect(LiveResyncSchema.safeParse({ subscriptionId: id, reason: 'OTHER' }).success).toBe(false);
  });
});
