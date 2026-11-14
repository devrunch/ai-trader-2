import { TradePlanInputSchema, type ActionCardDto, type AgentAction, type TradePlanDto, type TradePlanInput } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';
import { planGeometry, planSize } from '../domain/trade-plan';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

export interface TradePlanDeps {
  account(userId: string, symbol: string): Promise<{ initialCash: number; currency: string }>;
  propose(userId: string, action: AgentAction): Promise<ActionCardDto>;
  id(): string;
}

const INDIA = new Set(['NSE', 'BSE', 'NFO', 'BFO', 'MCX', 'CDS']);

/**
 * Trade ideas as an interactive card (the user sees levels on a ladder, can draw them, set alerts and place the paper order).
 * The model only names the levels; the server checks they fit the side, computes reward:risk and sizes to 0.5% of capital.
 */
export function buildTradePlanTools(d: TradePlanDeps, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'presentTradePlan',
    description: 'Show a trade idea as an interactive card instead of describing levels in text: symbol, side, entry, stop, 1-3 targets, confidence 0-1, '
      + 'horizon, a short rationale, what would invalidate it, and the skill used. The server checks the levels, computes reward:risk and a size at 0.5% risk, '
      + 'and attaches a paper order the user can confirm. Use it whenever you give entry/stop/target levels.',
    input: TradePlanInputSchema,
    run: (input, ctx) => buildPlan(d, ctx.userId, input) }, deps)];
}

/** Checks the levels, sizes at 0.5% risk and attaches the paper order card; shared with the desk tool. */
export async function buildPlan(d: TradePlanDeps, userId: string, input: TradePlanInput): Promise<TradePlanDto> {
  const geometry = planGeometry(input);
  if (!geometry.ok) throw new ValidationError(`Trade plan levels do not fit: ${geometry.reason}`);
  const account = await d.account(userId, input.symbol).catch(() => null);
  const size = account ? planSize(account.initialCash, geometry.riskPerUnit) : null;
  const exchange = input.symbol.split(':')[0] ?? '';
  const product = INDIA.has(exchange) && input.horizon !== 'intraday' ? 'CNC' : 'MIS';
  const orderCard = size ? await d.propose(userId, { kind: 'place-order', symbol: input.symbol, side: input.side, type: 'limit', product,
    quantity: size.quantity, limitPrice: input.entry, stopLoss: input.stopLoss, target: input.targets[0], rationale: input.rationale.slice(0, 500), clientOrderId: null }).catch(() => null) : null;
  return { ...input, id: d.id(), riskPerUnit: geometry.riskPerUnit, rewards: geometry.rewards,
    sizing: size && account ? { ...size, currency: account.currency } : null, orderCard };
}
