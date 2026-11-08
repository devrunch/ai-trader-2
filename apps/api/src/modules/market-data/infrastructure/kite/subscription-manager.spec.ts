import { describe, expect, it } from 'vitest';
import { SubscriptionManager } from './subscription-manager';

describe('FR-MD-4 Kite connection limits', () => {
  it('fills connections up to 3000 then opens the next', () => {
    const manager = new SubscriptionManager();
    for (let token = 1; token <= 6001; token++) manager.add(String(token));
    expect(manager.groups().map(group => group.length)).toEqual([3000, 3000, 1]);
    manager.remove('1'); expect(manager.add('7000')).toBe(0);
  });
  it('rejects beyond 9000 with UNSUPPORTED', () => {
    const manager = new SubscriptionManager();
    for (let token = 1; token <= 9000; token++) manager.add(String(token));
    expect(() => manager.add('9001')).toThrow(expect.objectContaining({ code: 'UNSUPPORTED', message: 'kite instrument cap reached', details: { detail: 'kite instrument cap reached' } }));
    expect(manager.add('1')).toBe(0);
  });
});
