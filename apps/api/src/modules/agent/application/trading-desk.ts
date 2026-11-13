import type { DeskDecision, DeskReport, DeskRunDto, DeskTrail } from '@aitrader/contracts';
import { ConflictError, RateLimitedError, ValidationError } from '../../../shared/errors';
import { clampRounds, finalDecision, gateProposal } from '../domain/desk-gate';
import type { DeskData, DeskSnapshot } from './desk-data';
import { macroAnalyst, newsAnalyst, researcher, riskManager, technicalAnalyst, trader, type RoleCall } from './desk-roles';

/** One focused model call that must answer in JSON matching the schema; `tokens` is what it used. */
export interface DeskModel { generate<T>(call: RoleCall<T>, signal: AbortSignal): Promise<{ data: T; tokens: number }> }
export interface DeskRunStore {
  insert(userId: string, run: DeskRunDto): Promise<void>;
  update(userId: string, run: DeskRunDto): Promise<void>;
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
/** A run still marked running after this long lost its process (a restart) and is shown as interrupted. */
const STALE_RUN_MS = 6 * 60_000;
const RUN_TIMEOUT_MS = 240_000;
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

  /** Starts a run and returns it at once, marked running; the page follows it by id while the roles work (it survives leaving the page). */
  async start(userId: string, request: { symbol: string; asOf?: number | undefined; rounds: number }): Promise<DeskRunDto> {
    const begun = await this.begin(userId, request);
    void this.complete(userId, begun, AbortSignal.timeout(RUN_TIMEOUT_MS)).catch(() => undefined);
    return begun.run;
  }

  /** Runs to the end (watches and desk backtests wait for the decision). */
  async run(userId: string, request: { symbol: string; asOf?: number | undefined; rounds: number }, signal: AbortSignal): Promise<DeskRunDto> {
    return this.complete(userId, await this.begin(userId, request), signal);
  }

  private async begin(userId: string, request: { symbol: string; asOf?: number | undefined; rounds: number }): Promise<Begun> {
    const now = this.env.now();
    const asOf = request.asOf ?? now;
    if (asOf > now + 60_000) throw new ValidationError('The as-of time cannot be in the future');
    if (await this.runsLeftToday(userId) <= 0) throw new RateLimitedError(`Daily desk run limit reached (${String(this.config.dailyRuns)}); try again tomorrow`, istMidnight(now) + 86_400_000 - now);
    const snapshot = await this.data.snapshot(request.symbol, asOf);
    const run: DeskRunDto = { id: this.env.id(), symbol: request.symbol, asOf: new Date(asOf).toISOString(), live: request.asOf === undefined, createdAt: new Date(now).toISOString(),
      status: 'running', decision: holdDecision('The desk is still working.'), trail: emptyTrail(snapshot), tokens: 0, calls: 0, error: null };
    await this.store.insert(userId, run);
    return { run, snapshot, rounds: clampRounds(request.rounds) };
  }

  private async complete(userId: string, { run, snapshot, rounds }: Begun, signal: AbortSignal): Promise<DeskRunDto> {
    const call = async <T>(spec: RoleCall<T>): Promise<T> => {
      if (run.tokens + TOKENS_PER_CALL_ESTIMATE > this.config.maxTokens && run.calls > 0) throw new BudgetStop(`the ${String(this.config.maxTokens)}-token budget for one run is used up`);
      const out = await this.model.generate(spec, signal);
      run.tokens += out.tokens;
      run.calls++;
      return out.data;
    };
    // Each finished step is saved, so the page shows the run filling in.
    const progress = () => this.store.update(userId, run).catch(() => undefined);
    try {
      run.decision = await this.deliberate(run.symbol, snapshot, rounds, call, run.trail, await this.env.cash(userId, run.symbol), progress);
      run.status = 'done';
    } catch (e) {
      run.status = e instanceof BudgetStop ? 'budget' : 'error';
      run.error = (e instanceof Error ? e.message : 'The desk failed').slice(0, 300);
      run.decision = holdDecision(run.status === 'budget' ? `Stopped: ${run.error}` : 'No decision: a role failed.');
    }
    await this.store.update(userId, run);
    if (signal.aborted && run.status === 'error') throw new Error(run.error ?? 'The desk run was cut off');
    return run;
  }

  async list(userId: string, query: { symbol?: string | undefined; limit: number }): Promise<DeskRunDto[]> {
    return (await this.store.list(userId, query)).map(r => this.settleStale(r));
  }

  async get(userId: string, id: string): Promise<DeskRunDto> {
    const run = await this.store.get(userId, id);
    if (!run) throw new ConflictError('Desk run not found', { id });
    return this.settleStale(run);
  }

  private settleStale(run: DeskRunDto): DeskRunDto {
    if (run.status !== 'running' || this.env.now() - Date.parse(run.createdAt) < STALE_RUN_MS) return run;
    return { ...run, status: 'error', error: 'The run was interrupted (the server restarted). Run it again.' };
  }

  private async deliberate(symbol: string, s: DeskSnapshot, rounds: number, call: <T>(spec: RoleCall<T>) => Promise<T>, trail: DeskTrail, cash: number,
    progress: () => Promise<unknown>): Promise<DeskDecision> {
    const hasNews = s.headlines.length > 0;
    const hasEvents = s.events.length > 0;
    const hasBars = s.intraday.length + s.daily.length > 0;
    const [news, technical, macro] = await Promise.all([
      hasNews || hasEvents ? call(newsAnalyst(symbol, s)) : skipped('no headlines or events before the as-of time'),
      hasBars ? call(technicalAnalyst(symbol, s)) : skipped('no bars before the as-of time'),
      hasEvents || hasNews ? call(macroAnalyst(symbol, s)) : skipped('no calendar or headlines before the as-of time'),
    ]);
    trail.reports = { news, technical, macro, fundamentals: skipped('no fundamentals data source for this instrument') };
    await progress();
    const reports: Record<'news' | 'technical' | 'macro', DeskReport | { skipped: string }> = { news, technical, macro };
    if ([news, technical, macro].every(r => 'skipped' in r)) return holdDecision('No data before the as-of time, so no decision.');
    for (let round = 1; round <= rounds; round++) {
      trail.debate.push(await call(researcher('bull', round, symbol, s, reports, trail.debate)));
      trail.debate.push(await call(researcher('bear', round, symbol, s, reports, trail.debate)));
      await progress();
    }
    const proposal = await call(trader(symbol, s, reports, trail.debate, this.env.skills()));
    trail.proposal = proposal;
    const gate = gateProposal(proposal, { minRewardRisk: this.config.minRewardRisk, maxRiskPct: this.config.maxRiskPct, initialCash: cash });
    trail.gate = { pass: gate.pass, blocks: gate.blocks };
    await progress();
    const review = proposal.action === 'HOLD' ? { approve: true, reasons: [] } : await call(riskManager(symbol, proposal, gate.blocks, reports, s));
    trail.riskReview = review;
    return finalDecision(proposal, gate, review);
  }
}

interface Begun { run: DeskRunDto; snapshot: DeskSnapshot; rounds: number }

function emptyTrail(s: DeskSnapshot): DeskTrail {
  return { data: { asOf: new Date(s.asOf).toISOString(), lastClose: s.lastClose, bars: s.intraday.length + s.daily.length, headlines: s.headlines.length, events: s.events.length },
    reports: { news: skipped('not run'), technical: skipped('not run'), macro: skipped('not run'), fundamentals: skipped('no fundamentals data source for this instrument') },
    debate: [], proposal: null, riskReview: null, gate: { pass: true, blocks: [] } };
}
