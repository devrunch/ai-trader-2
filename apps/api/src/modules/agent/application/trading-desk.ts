import type { DeskDecision, DeskReport, DeskRunDto, DeskTrail } from '@aitrader/contracts';
import { ConflictError, RateLimitedError, ValidationError } from '../../../shared/errors';
import { clampRounds, finalDecision, gateProposal } from '../domain/desk-gate';
import type { DeskData, DeskSnapshot } from './desk-data';
import { macroAnalyst, newsAnalyst, researcher, riskManager, technicalAnalyst, trader, type RoleCall } from './desk-roles';

/** One focused model call that must answer in JSON matching the schema; `tokens` is what it used. */
export interface DeskModel { generate<T>(call: RoleCall<T>, signal: AbortSignal): Promise<{ data: T; tokens: number }> }
export interface DeskRunStore {
  insert(userId: string, run: DeskRunDto): Promise<void>;
  list(userId: string, query: { symbol?: string | undefined; limit: number }): Promise<DeskRunDto[]>;
  get(userId: string, id: string): Promise<DeskRunDto | null>;
  countSince(userId: string, since: number): Promise<number>;
}
export interface DeskConfig { maxTokens: number; dailyRuns: number; minRewardRisk: number; maxRiskPct: number; defaultCash: number }

const CALLS_PER_ROUND = 2;
/** Analysts (3) + trader + risk, plus two debate calls per round. */
export const callsPerRun = (rounds: number): number => 5 + CALLS_PER_ROUND * clampRounds(rounds);
export const TOKENS_PER_CALL_ESTIMATE = 4000;

const IST_MS = 19_800_000;
const istMidnight = (now: number): number => now - ((now + IST_MS) % 86_400_000);
class BudgetStop extends Error { override readonly name = 'BudgetStop'; }
const skipped = (reason: string): { skipped: string } => ({ skipped: reason });

function holdDecision(reason: string): DeskDecision {
  return { action: 'HOLD', confidence: 0, entry: null, stopLoss: null, target: null, quantity: null, skill: null, summary: reason, vetoed: false, vetoReasons: [] };
}

/**
 * The trading desk (the TradingAgents pattern, re-implemented on this app's own tools): analysts, a bull/bear debate, a trader, a risk manager.
 * All data comes through `DeskData` at one `asOf`, so a replay of a past date sees only what existed then. The size is computed by code, never by the model.
 */
export class TradingDesk {
  constructor(private readonly data: DeskData, private readonly model: DeskModel, private readonly store: DeskRunStore, private readonly config: DeskConfig,
    private readonly env: { now: () => number; id: () => string; skills: () => string[]; cash: (userId: string, symbol: string) => Promise<number> }) {}

  async runsLeftToday(userId: string): Promise<number> {
    return Math.max(0, this.config.dailyRuns - await this.store.countSince(userId, istMidnight(this.env.now())));
  }

  async run(userId: string, request: { symbol: string; asOf?: number | undefined; rounds: number }, signal: AbortSignal): Promise<DeskRunDto> {
    const now = this.env.now();
    const asOf = request.asOf ?? now;
    if (asOf > now + 60_000) throw new ValidationError('The as-of time cannot be in the future');
    if (await this.runsLeftToday(userId) <= 0) throw new RateLimitedError(`Daily desk run limit reached (${String(this.config.dailyRuns)}); try again tomorrow`, istMidnight(now) + 86_400_000 - now);
    const rounds = clampRounds(request.rounds);
    const snapshot = await this.data.snapshot(request.symbol, asOf);
    let tokens = 0;
    let calls = 0;
    const call = async <T>(spec: RoleCall<T>): Promise<T> => {
      if (tokens + TOKENS_PER_CALL_ESTIMATE > this.config.maxTokens && calls > 0) throw new BudgetStop(`the ${String(this.config.maxTokens)}-token budget for one run is used up`);
      const out = await this.model.generate(spec, signal);
      tokens += out.tokens;
      calls++;
      return out.data;
    };
    const trail = emptyTrail(snapshot);
    let status: DeskRunDto['status'] = 'done';
    let error: string | null = null;
    let decision: DeskDecision;
    try {
      decision = await this.deliberate(request.symbol, snapshot, rounds, call, trail, await this.env.cash(userId, request.symbol));
    } catch (e) {
      if (signal.aborted) throw e;
      status = e instanceof BudgetStop ? 'budget' : 'error';
      error = (e instanceof Error ? e.message : 'The desk failed').slice(0, 300);
      decision = holdDecision(status === 'budget' ? `Stopped: ${error}` : 'No decision: a role failed.');
    }
    const run: DeskRunDto = { id: this.env.id(), symbol: request.symbol, asOf: new Date(asOf).toISOString(), live: request.asOf === undefined, createdAt: new Date(now).toISOString(), status,
      decision, trail, tokens, calls, error };
    await this.store.insert(userId, run);
    return run;
  }

  async list(userId: string, query: { symbol?: string | undefined; limit: number }): Promise<DeskRunDto[]> { return this.store.list(userId, query); }

  async get(userId: string, id: string): Promise<DeskRunDto> {
    const run = await this.store.get(userId, id);
    if (!run) throw new ConflictError('Desk run not found', { id });
    return run;
  }

  private async deliberate(symbol: string, s: DeskSnapshot, rounds: number, call: <T>(spec: RoleCall<T>) => Promise<T>, trail: DeskTrail, cash: number): Promise<DeskDecision> {
    const hasNews = s.headlines.length > 0;
    const hasEvents = s.events.length > 0;
    const hasBars = s.intraday.length + s.daily.length > 0;
    const [news, technical, macro] = await Promise.all([
      hasNews || hasEvents ? call(newsAnalyst(symbol, s)) : skipped('no headlines or events before the as-of time'),
      hasBars ? call(technicalAnalyst(symbol, s)) : skipped('no bars before the as-of time'),
      hasEvents || hasNews ? call(macroAnalyst(symbol, s)) : skipped('no calendar or headlines before the as-of time'),
    ]);
    trail.reports = { news, technical, macro, fundamentals: skipped('no fundamentals data source for this instrument') };
    const reports: Record<'news' | 'technical' | 'macro', DeskReport | { skipped: string }> = { news, technical, macro };
    if ([news, technical, macro].every(r => 'skipped' in r)) return holdDecision('No data before the as-of time, so no decision.');
    for (let round = 1; round <= rounds; round++) {
      trail.debate.push(await call(researcher('bull', round, symbol, s, reports, trail.debate)));
      trail.debate.push(await call(researcher('bear', round, symbol, s, reports, trail.debate)));
    }
    const proposal = await call(trader(symbol, s, reports, trail.debate, this.env.skills()));
    trail.proposal = proposal;
    const gate = gateProposal(proposal, { minRewardRisk: this.config.minRewardRisk, maxRiskPct: this.config.maxRiskPct, initialCash: cash });
    trail.gate = { pass: gate.pass, blocks: gate.blocks };
    const review = proposal.action === 'HOLD' ? { approve: true, reasons: [] } : await call(riskManager(symbol, proposal, gate.blocks, reports, s));
    trail.riskReview = review;
    return finalDecision(proposal, gate, review);
  }
}

function emptyTrail(s: DeskSnapshot): DeskTrail {
  return { data: { asOf: new Date(s.asOf).toISOString(), lastClose: s.lastClose, bars: s.intraday.length + s.daily.length, headlines: s.headlines.length, events: s.events.length },
    reports: { news: skipped('not run'), technical: skipped('not run'), macro: skipped('not run'), fundamentals: skipped('no fundamentals data source for this instrument') },
    debate: [], proposal: null, riskReview: null, gate: { pass: true, blocks: [] } };
}
