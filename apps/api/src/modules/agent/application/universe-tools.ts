import { z } from 'zod';
import { UNIVERSES, type UniverseId, type UniverseInfo } from '@aitrader/contracts';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

export interface UniverseSource {
  list(): Promise<UniverseInfo[]>;
  members(id: UniverseId, userId: string): Promise<Array<{ symbol: string; name: string | null }>>;
}

const MEMBER_CAP = 100;
const SOURCE = 'nse-indices, curated lists, instrument master';

/** The sets of instruments a scan can run on, so the model names a real universe instead of guessing symbols. */
export function buildUniverseTools(universes: UniverseSource, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'listUniverse',
      description: 'Without an argument: the available universes (NIFTY 50/100/500, forex majors and crosses, commodities, US large caps, crypto majors, the user\'s watchlist) with how many priceable members each has. '
        + `With a universe id: its members (up to ${String(MEMBER_CAP)}, plus the total). Counts include only instruments we can price.`,
      input: z.strictObject({ universe: z.enum(UNIVERSES).optional() }),
      run: async ({ universe }, ctx) => {
        if (universe === undefined) return { source: SOURCE, universes: await universes.list() };
        const members = await universes.members(universe, ctx.userId);
        return { source: SOURCE, universe, total: members.length, shown: Math.min(members.length, MEMBER_CAP), truncated: members.length > MEMBER_CAP, members: members.slice(0, MEMBER_CAP) };
      } }, deps),
  ];
}
