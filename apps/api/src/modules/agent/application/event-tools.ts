import { z } from 'zod';
import type { EventScorecard } from '@aitrader/contracts';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

/** The calendar module's scorecard, as the agent sees it. */
export interface ScorecardPort {
  get(query: { title: string; country?: string | undefined; limit: number; asOf?: number | undefined }): Promise<EventScorecard | null>;
}

const SOURCE = 'calendar history';

/** Past releases of a scheduled event with their surprise and how the instruments moved, so the model reads a reaction from data instead of memory. */
export function buildEventScorecardTools(scorecards: ScorecardPort, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'getEventScorecard',
    description: 'How past releases of a scheduled economic event went and how markets reacted: for each release the forecast, actual, surprise (actual minus forecast, plus in standard deviations once enough history exists) '
      + 'and the move of each related instrument 5, 15 and 60 minutes after it, plus per-instrument averages after a beat and after a miss, and what the event measures. '
      + 'Example: "how does USD/INR react to US CPI surprises" -> title "CPI", country "USD". The title is the event name or a keyword (case-insensitive); the best match is returned and its exact title is in the answer. '
      + 'Only history we stored is available, so a new event can have none yet.',
    input: z.strictObject({ title: z.string().min(2).max(120), country: z.string().regex(/^[A-Z]{3}$/).optional(), limit: z.number().int().min(1).max(20).default(8), asOf: z.iso.datetime({ offset: true }).optional() }),
    run: async input => {
      const card = await scorecards.get({ title: input.title, country: input.country, limit: input.limit, asOf: input.asOf ? Date.parse(input.asOf) : undefined });
      if (!card) return { available: false, source: SOURCE, reason: `no history yet for "${input.title}"${input.country ? ` (${input.country})` : ''}: it has not been released while we were recording` };
      return { available: true, source: SOURCE, title: card.title, country: card.country, spec: card.spec,
        releases: card.releases.map(r => ({ at: r.at, forecast: r.forecast, previous: r.previous, actual: r.actual, surprise: r.surprise, surpriseZ: r.surpriseZ,
          moves: r.reactions.map(x => ({ symbol: x.symbol, move5Pct: x.move5Pct, move15Pct: x.move15Pct, move60Pct: x.move60Pct })) })),
        stats: card.stats };
    } }, deps)];
}
