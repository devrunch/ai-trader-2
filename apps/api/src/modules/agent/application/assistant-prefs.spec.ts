import { describe, expect, it } from 'vitest';
import type { AssistantPrefs } from '@aitrader/contracts';
import { AssistantPrefsService, DEFAULT_PREFS, type PrefsStore } from './assistant-prefs';

const memory = (): PrefsStore => { const rows = new Map<string, AssistantPrefs>(); return { get: u => Promise.resolve(rows.get(u) ?? null), set: (u, p) => { rows.set(u, p); return Promise.resolve(); } }; };

describe('how much the assistant may do on its own', () => {
  it('trades on paper by itself by default, at 0.5% risk and 3 trades a day', async () => {
    const prefs = new AssistantPrefsService(memory(), true);
    expect(await prefs.get('u1')).toEqual({ ...DEFAULT_PREFS, allowed: true });
    expect(await prefs.autoTradeFor('u1')).toEqual({ enabled: true, maxRiskPct: 0.5, maxTradesPerDay: 3, requireBacktest: false });
  });

  it('asks first when the user chooses it, and uses the user\'s limits when acting', async () => {
    const prefs = new AssistantPrefsService(memory(), true);
    await prefs.set('u1', { mode: 'ask', maxRiskPct: 1, maxTradesPerDay: 5 });
    expect(await prefs.autoTradeFor('u1')).toBeNull();
    await prefs.set('u1', { mode: 'act', maxRiskPct: 1, maxTradesPerDay: 5 });
    expect(await prefs.autoTradeFor('u1')).toMatchObject({ enabled: true, maxRiskPct: 1, maxTradesPerDay: 5 });
  });

  it('the admin kill switch makes every assistant ask first', async () => {
    const prefs = new AssistantPrefsService(memory(), false);
    await prefs.set('u1', { mode: 'act', maxRiskPct: 1, maxTradesPerDay: 5 });
    expect(await prefs.get('u1')).toMatchObject({ mode: 'ask', allowed: false });
    expect(await prefs.autoTradeFor('u1')).toBeNull();
  });
});
