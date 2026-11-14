import { z } from 'zod';
import { DESK_LIMITS, DeskRunRequestSchema, type DeskDecision, type DeskRunDto, type TradePlanDto } from '@aitrader/contracts';
import { planGeometry } from '../domain/trade-plan';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';
import { buildPlan, type TradePlanDeps } from './trade-plan-tools';

const RUN_TIMEOUT_MS = 240_000;

export interface DeskToolDeps extends TradePlanDeps {
  run(userId: string, request: { symbol: string; asOf?: number; rounds: number }, signal: AbortSignal): Promise<DeskRunDto>;
}

interface DeskAnswer { action: DeskDecision['action']; confidence: number; summary: string; reasons: string[]; plan: TradePlanDto | null; stopped: boolean }

/** The levels of a BUY or SELL that survived the desk's risk check, or why there is no card. */
function planInput(symbol: string, d: DeskDecision): { input: Parameters<typeof buildPlan>[2] } | { why: string } {
  if (d.action === 'HOLD') return { why: d.summary };
  if (d.vetoed) return { why: d.vetoReasons.join('; ') || d.summary };
  if (d.entry === null || d.stopLoss === null || d.target === null) return { why: 'The decision came without full entry, stop and target levels.' };
  const side = d.action === 'BUY' ? ('buy' as const) : ('sell' as const);
  const input = { symbol, interval: '15' as const, side, entry: d.entry, stopLoss: d.stopLoss, targets: [d.target], confidence: d.confidence,
    horizon: 'intraday' as const, rationale: d.summary.slice(0, 600).padEnd(10, '.'), ...(d.skill ? { skill: d.skill.slice(0, 60) } : {}) };
  const geometry = planGeometry(input);
  return geometry.ok ? { input } : { why: `The levels do not fit a ${side}: ${geometry.reason}` };
}

/** The trading desk as one tool: analysts, a bull and bear debate, a trader and a risk check, returned as the same card `presentTradePlan` shows. */
export function buildDeskTools(d: DeskToolDeps, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'askDesk',
    description: 'Get a considered decision on one instrument: the full trading desk (news, technical, macro and fundamentals analysts, a bull and bear debate, a trader and a risk check) '
      + 'reads real data and answers BUY, SELL or HOLD. A BUY or SELL comes back as a trade-plan card with the levels, reward:risk, size and a paper order to confirm; '
      + `a HOLD comes back with the reasons. Slow and costly: use it when the user wants a considered decision, not for a quick look. asOf replays an earlier time; rounds 1-${String(DESK_LIMITS.maxRounds)} sets the debate length.`,
    input: z.strictObject({ symbol: DeskRunRequestSchema.shape.symbol, asOf: DeskRunRequestSchema.shape.asOf, rounds: z.number().int().min(1).max(DESK_LIMITS.maxRounds).default(1) }),
    run: async ({ symbol, asOf, rounds }, ctx): Promise<DeskAnswer> => {
      const run = await d.run(ctx.userId, { symbol, rounds, ...(asOf ? { asOf: Date.parse(asOf) } : {}) }, AbortSignal.timeout(RUN_TIMEOUT_MS));
      const { decision } = run;
      if (run.status !== 'done') return { action: 'HOLD', confidence: 0, summary: run.error ?? decision.summary, reasons: [run.error ?? decision.summary], plan: null, stopped: true };
      const built = planInput(symbol, decision);
      if ('why' in built) return { action: decision.action, confidence: decision.confidence, summary: decision.summary, reasons: [built.why], plan: null, stopped: false };
      return { action: decision.action, confidence: decision.confidence, summary: decision.summary, reasons: [], plan: await buildPlan(d, ctx.userId, built.input), stopped: false };
    } }, deps)];
}
