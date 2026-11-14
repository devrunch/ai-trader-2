import type { AssistantPrefs, AssistantPrefsResponse, AutoTrade } from '@aitrader/contracts';

export interface PrefsStore { get(userId: string): Promise<AssistantPrefs | null>; set(userId: string, prefs: AssistantPrefs): Promise<void> }

/** Owner decision 2026-11-14: on paper the assistant trades by itself unless the user asks it to ask first. */
export const DEFAULT_PREFS: AssistantPrefs = { mode: 'act', maxRiskPct: 0.5, maxTradesPerDay: 3 };

/** The user's one setting for how much the assistant may do on its own, and the limits it trades inside. */
export class AssistantPrefsService {
  constructor(private readonly store: PrefsStore, private readonly allowed: boolean) {}

  async get(userId: string): Promise<AssistantPrefsResponse> {
    const prefs = (await this.store.get(userId)) ?? DEFAULT_PREFS;
    return { ...prefs, mode: this.allowed ? prefs.mode : 'ask', allowed: this.allowed };
  }

  async set(userId: string, prefs: AssistantPrefs): Promise<AssistantPrefsResponse> {
    await this.store.set(userId, prefs);
    return this.get(userId);
  }

  /** What a new task may trade by itself: nothing when the user (or the admin) wants to be asked first. */
  async autoTradeFor(userId: string): Promise<AutoTrade | null> {
    const prefs = await this.get(userId);
    return prefs.mode === 'act' ? { enabled: true, maxRiskPct: prefs.maxRiskPct, maxTradesPerDay: prefs.maxTradesPerDay, requireBacktest: false } : null;
  }
}
