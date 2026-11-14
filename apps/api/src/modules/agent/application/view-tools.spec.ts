import { describe, expect, it } from 'vitest';
import { buildViewTools } from './view-tools';

const ctx = { userId: 'u1', conversationId: '7d9f0a2e-0000-4000-8000-000000000001', turnId: 'turn-abcdef12' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };
const tool = (name: string) => buildViewTools(deps).find(t => t.name === name);

describe('view tools', () => {
  it('returns a checked view with defaults filled in', async () => {
    const out = await tool('showView')?.call(ctx, { blocks: [{ kind: 'chart', symbol: 'NSE:TCS' }, { kind: 'actions', buttons: [{ label: 'Open', action: { type: 'open-symbol', symbol: 'NSE:TCS' } }] }] });
    expect(out).toEqual({ ok: true, data: { blocks: [{ kind: 'chart', symbol: 'NSE:TCS', interval: '1D', bars: 60, levels: [] },
      { kind: 'actions', buttons: [{ label: 'Open', action: { type: 'open-symbol', symbol: 'NSE:TCS' } }] }] } });
  });
  it('refuses a button that would do anything but open, alert or ask', async () => {
    const out = await tool('showView')?.call(ctx, { blocks: [{ kind: 'actions', buttons: [{ label: 'Buy', action: { type: 'place-order', symbol: 'NSE:TCS' } }] }] });
    expect(out).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
  it('caps a custom view at 30 KB', async () => {
    expect(await tool('showCustomView')?.call(ctx, { title: 'Big', html: 'x'.repeat(30_001) })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
    expect(await tool('showCustomView')?.call(ctx, { title: 'Map', html: '<div>sector heatmap</div>' })).toEqual({ ok: true, data: { title: 'Map', html: '<div>sector heatmap</div>', data: {}, height: 360 } });
  });
});
