import { z } from 'zod';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

/** Always on: the daily reads, the trade card, the desk, memory and the loader. Everything else waits for `loadTools`. */
export const CORE_TOOLS = ['getQuote', 'getBars', 'searchInstruments', 'getIndicator', 'listIndicators', 'getNews', 'getEconomicCalendar', 'getMarketStatus', 'getPortfolio',
  'calculate', 'listSkills', 'useSkill', 'presentTradePlan', 'askDesk', 'remember', 'forget', 'loadTools'] as const;

export const TOOL_GROUPS = {
  screening: ['scanUniverse', 'watchScreen', 'listUniverse', 'getWatchlist', 'addToWatchlist', 'removeFromWatchlist'],
  events: ['getEventScorecard', 'watchEvent'],
  'news-deep': ['getSentiment', 'getCrowd', 'watchNews'],
  execution: ['placePaperOrder', 'cancelPaperOrder', 'closePaperPosition', 'createAlert', 'scheduleTask', 'watchMove', 'listTasks', 'cancelTask'],
  chart: ['proposeChartAction', 'proposeDrawing', 'proposePineScript'],
  strategies: ['runBacktest', 'saveStrategy'],
  research: ['getFundamentals', 'getDepth', 'webSearch'],
} as const;
export type ToolGroup = keyof typeof TOOL_GROUPS;
const GROUP_NAMES = Object.keys(TOOL_GROUPS) as [ToolGroup, ...ToolGroup[]];

const GROUP_PURPOSE: Record<ToolGroup, string> = {
  screening: 'scan a market or index for candidates, watchlists', events: 'how an instrument reacted to past releases, watch a release',
  'news-deep': 'news sentiment, crowd chatter, watch the news', execution: 'paper orders, alerts, promises to act later',
  chart: 'chart indicators, drawings, Pine scripts', strategies: 'backtests and saved strategies', research: 'fundamentals, order book, web search',
};

const groupOf = (name: string): ToolGroup | undefined => GROUP_NAMES.find(g => (TOOL_GROUPS[g] as readonly string[]).includes(name));

/** Which groups each turn has loaded; a group stays loaded until the turn ends. */
export class ToolLoader {
  private readonly loaded = new Map<string, Set<ToolGroup>>();

  load(turnId: string, group: ToolGroup): void {
    const set = this.loaded.get(turnId) ?? new Set<ToolGroup>();
    set.add(group);
    this.loaded.set(turnId, set);
  }

  isActive(turnId: string, name: string): boolean {
    const group = groupOf(name);
    return group === undefined || (this.loaded.get(turnId)?.has(group) ?? false);
  }

  /** The tool names the model may see and call now: the core plus every loaded group. */
  active(turnId: string): string[] {
    return [...CORE_TOOLS, ...[...this.loaded.get(turnId) ?? []].flatMap(g => TOOL_GROUPS[g])];
  }

  end(turnId: string): void { this.loaded.delete(turnId); }
}

/** A grouped tool refuses until its group is loaded, even if a model calls it by name without the schema. */
export function gateTools(tools: Array<GuardedTool<unknown, unknown>>, loader: ToolLoader): Array<GuardedTool<unknown, unknown>> {
  return tools.map(tool => {
    const group = groupOf(tool.name);
    if (!group) return tool;
    return { ...tool, call: (ctx, raw) => loader.isActive(ctx.turnId, tool.name) ? tool.call(ctx, raw)
      : Promise.resolve({ ok: false as const, reason: 'NOT_LOADED', detail: `Call loadTools with group "${group}" first, then use ${tool.name}.` }) };
  });
}

export function buildLoadTools(loader: ToolLoader, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'loadTools',
    description: 'Make more tools available for the rest of this answer. Groups: ' + GROUP_NAMES.map(g => `${g} (${GROUP_PURPOSE[g]})`).join('; ')
      + '. Load a group before you need it; one call loads all its tools.',
    input: z.strictObject({ group: z.enum(GROUP_NAMES) }),
    run: ({ group }, ctx) => {
      loader.load(ctx.turnId, group);
      return Promise.resolve({ group, tools: [...TOOL_GROUPS[group]], note: 'These tools can be used from your next step.' });
    } }, deps)];
}
