import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { buildActionTools, buildIndicatorTools } from './action-tools';
import { buildBacktestTools } from './backtest-tools';
import { buildDeskTools } from './desk-tools';
import { buildDepthTools } from './depth-tools';
import { buildEventScorecardTools } from './event-tools';
import { buildFundamentalsTools } from './fundamentals-tools';
import { buildMarketStatusTools } from './market-status-tools';
import { buildCalcTool, buildCalendarTools, buildMemoryTools, buildNewsTools, buildPaperTools, buildSkillTools, buildTaskTools, buildWatchlistTools } from './power-tools';
import { buildReadTools } from './read-tools';
import { buildResearchTools } from './research-tools';
import { buildScreenerTools } from './screener-tools';
import { buildTradePlanTools } from './trade-plan-tools';
import { buildUniverseTools } from './universe-tools';
import { CORE_TOOLS, TOOL_GROUPS, ToolLoader, buildLoadTools, type ToolGroup } from './tool-groups';

const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };
/** Builders only read their ports when a tool runs, so an empty port is enough to get the definitions. */
const port: never = new Proxy({}, { get: () => () => undefined }) as never;
const definitions = [...buildReadTools(port, deps), ...buildIndicatorTools(port, deps), ...buildActionTools(port, deps), ...buildCalcTool(deps), ...buildTradePlanTools(port, deps),
  ...buildSkillTools(port, deps), ...buildPaperTools(port, deps), ...buildTaskTools(port, deps), ...buildNewsTools(port, deps), ...buildWatchlistTools(port, deps), ...buildMemoryTools(port, deps),
  ...buildCalendarTools(port, deps), ...buildResearchTools(port, deps), ...buildEventScorecardTools(port, deps), ...buildMarketStatusTools(deps), ...buildDepthTools(port, deps),
  ...buildFundamentalsTools(port, deps), ...buildUniverseTools(port, deps), ...buildScreenerTools(port, [], port, deps), ...buildBacktestTools(port, deps), ...buildDeskTools(port, deps),
  ...buildLoadTools(new ToolLoader(), deps)];

/** About four characters a token: the name, the description and the JSON schema the model is sent for each tool. */
const tokens = (names: string[]): number => Math.round(definitions.filter(t => names.includes(t.name))
  .map(t => JSON.stringify({ name: t.name, description: t.description, parameters: z.toJSONSchema(t.input) }).length).reduce((a, b) => a + b, 0) / 4);

/** The fixed conversation: each turn lists the groups the assistant loads; the first step has the core, later steps the core and what it loaded. */
const SCRIPT: Array<{ say: string; loads: ToolGroup[] }> = [
  { say: 'Where is Reliance now?', loads: [] }, { say: 'Is Nifty trending? Give me the RSI.', loads: [] },
  { say: 'Scan the Nifty 50 for breakouts and show the best three.', loads: ['screening'] },
  { say: 'If Reliance closes above 1,350, buy on paper with a stop.', loads: ['execution'] },
  { say: 'What is the news mood on crude?', loads: ['news-deep'] }, { say: 'Should I buy TCS? I want a considered decision.', loads: [] },
];

describe('tool definitions per turn', () => {
  it('sends far fewer tool tokens per turn than sending every tool every time', () => {
    const everyTool = definitions.map(t => t.name);
    const stepsOf = (loads: ToolGroup[]): string[][] => loads.length === 0 ? [[...CORE_TOOLS], [...CORE_TOOLS]]
      : [[...CORE_TOOLS], [...CORE_TOOLS, ...loads.flatMap(g => TOOL_GROUPS[g])], [...CORE_TOOLS, ...loads.flatMap(g => TOOL_GROUPS[g])]];
    const before = SCRIPT.map(turn => stepsOf(turn.loads).length * tokens(everyTool));
    const after = SCRIPT.map(turn => stepsOf(turn.loads).map(tokens).reduce((a, b) => a + b, 0));
    const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
    expect(definitions.map(t => t.name).sort()).toEqual([...new Set(definitions.map(t => t.name))].sort());
    expect(sum(after)).toBeLessThan(sum(before) * 0.6);
  });
});
