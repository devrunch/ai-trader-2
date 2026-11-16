import { describe, expect, it } from 'vitest';
import { OpsTokenGuard } from './ops-token.guard';

const ctx = (token?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ header: (name: string) => (name === 'x-ops-token' ? token : undefined) }) }) }) as never;
const TOKEN = 'x'.repeat(32);

describe('OpsTokenGuard', () => {
  it('lets the right token through and answers 404 to anything else', () => {
    const guard = new OpsTokenGuard({ OPS_READ_TOKEN: TOKEN } as never);
    expect(guard.canActivate(ctx(TOKEN))).toBe(true);
    expect(() => guard.canActivate(ctx('wrong'))).toThrow('Not found');
    expect(() => guard.canActivate(ctx())).toThrow('Not found');
  });
  it('does not exist without a configured token', () => {
    expect(() => new OpsTokenGuard({} as never).canActivate(ctx(TOKEN))).toThrow('Not found');
  });
});
