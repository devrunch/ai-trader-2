import { z } from 'zod';
import type { WhatToWatchResponse } from '@aitrader/contracts';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

/** The user's What to watch list: answer "what should I watch?" from it, and refresh it when it is stale or the user asks. */
export function buildWhatToWatchTools(watch: { get(userId: string): Promise<WhatToWatchResponse>; refresh(userId: string, force?: boolean): Promise<WhatToWatchResponse> },
  deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'getWhatToWatch',
    description: 'The user\'s "What to watch" list (shown on their Home page): items with why, symbols, the expected direction, how sure, today or this week, a level to follow, '
      + 'and how past items turned out. Use it when the user asks what to watch, what matters today, or about an item. Pass refresh true to write a fresh list now '
      + '(kept for 30 minutes); otherwise read the current one.',
    input: z.strictObject({ refresh: z.boolean().default(false) }),
    run: (input, ctx) => (input.refresh ? watch.refresh(ctx.userId) : watch.get(ctx.userId)) }, deps)];
}
