import { z } from 'zod';
import { AgentProfileSchema, type AgentProfile } from '@aitrader/contracts';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

export interface ProfileDesk { update(userId: string, patch: Record<string, unknown>): Promise<AgentProfile> }

const nullable = Object.fromEntries(Object.entries(AgentProfileSchema.shape).map(([k, v]) => [k, v.nullable()]));

export function buildProfileTools(profile: ProfileDesk, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'updateProfile',
    description: 'Record how the user trades or likes answers, when they say so ("I only trade BANKNIFTY options", "keep it short", "ask before every paper order"): '
      + 'markets, instruments, timeframes, riskPerTradePct, autonomy (ask | within-limits, paper only), length (short | detailed), format (cards | text), language. '
      + 'Send only the fields they stated; null removes a field. Not for one-off requests.',
    input: z.strictObject(Object.fromEntries(Object.entries(nullable).map(([k, v]) => [k, v.optional()]))),
    run: (input, ctx) => profile.update(ctx.userId, input) }, deps)];
}
