import { describe, expect, it, vi } from 'vitest';
import { BrokerVenue, VenueRouter, type ExecutionVenue } from './execution-venue';

const paper = { kind: 'paper', place: vi.fn().mockResolvedValue('paper-order'), price: vi.fn().mockResolvedValue(100) } as unknown as ExecutionVenue;
const broker = new BrokerVenue();
const optIn = (value: boolean) => ({ enabled: vi.fn().mockResolvedValue(value) });

describe('VenueRouter', () => {
  it('refuses to be built in production with broker mode', () => {
    expect(() => new VenueRouter(paper, broker, optIn(true), { mode: 'broker', nodeEnv: 'production' })).toThrow('not allowed when NODE_ENV=production');
  });

  it('serves paper in paper mode without even asking for the opt-in', async () => {
    const asked = optIn(true);
    expect((await new VenueRouter(paper, broker, asked, { mode: 'paper', nodeEnv: 'development' }).forUser('u1')).kind).toBe('paper');
    expect(asked.enabled).not.toHaveBeenCalled();
  });

  it('in development broker mode serves the broker venue only to a user who opted in', async () => {
    const config = { mode: 'broker' as const, nodeEnv: 'development' };
    expect((await new VenueRouter(paper, broker, optIn(true), config).forUser('u1')).kind).toBe('broker');
    expect((await new VenueRouter(paper, broker, optIn(false), config).forUser('u2')).kind).toBe('paper');
  });

  it('the broker venue is a stub: every call refuses and no order can go out', async () => {
    await expect(broker.place()).rejects.toMatchObject({ details: { reason: 'BROKER_NOT_IMPLEMENTED' } });
    const routed = new VenueRouter(paper, broker, optIn(false), { mode: 'broker', nodeEnv: 'development' }).routed();
    expect(await routed.place('u1', {} as never)).toBe('paper-order');
  });
});
