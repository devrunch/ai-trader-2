import type { DeskBacktestDto, DeskBacktestRequest, DeskEstimate, DeskScoreSummary, DeskScored } from '@aitrader/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import { scoreDecision, summarise } from '../domain/desk-score';
import { callsPerRun, TOKENS_PER_CALL_ESTIMATE, type TradingDesk } from './trading-desk';

export interface StoredBacktest {
  id: string; userId: string; symbol: string; request: DeskBacktestRequest; status: 'running' | 'done' | 'failed'; done: number; total: number;
  items: DeskScored[]; summary: DeskScoreSummary | null; tokens: number; createdAt: string; finishedAt: string | null; error: string | null;
}
export interface DeskBacktestStore {
  insert(row: StoredBacktest): Promise<void>;
  save(row: StoredBacktest): Promise<void>;
  get(userId: string, id: string): Promise<StoredBacktest | null>;
  list(userId: string, symbol: string | undefined, limit: number): Promise<StoredBacktest[]>;
}
interface FutureBars { after(symbol: string, interval: DeskBacktestRequest['interval'], from: number, limit: number): Promise<Array<{ time: number; open: number; high: number; low: number; close: number }>> }

/** Dates are decided at 10:00 IST: before the NSE open has any bars to speak of and before the US open, so no later bar is ever part of the decision. */
export const decisionTime = (date: string): number => Date.parse(`${date}T10:00:00+05:30`);
const INTERRUPTED_AFTER_MS = 2 * 3_600_000;

const dto = (b: StoredBacktest, now: number): DeskBacktestDto => {
  const stale = b.status === 'running' && now - Date.parse(b.createdAt) > INTERRUPTED_AFTER_MS;
  return { id: b.id, symbol: b.symbol, status: stale ? 'failed' : b.status, rounds: b.request.rounds, progress: { done: b.done, total: b.total }, items: b.items, summary: b.summary,
    tokens: b.tokens, createdAt: b.createdAt, finishedAt: b.finishedAt, error: stale ? 'Interrupted (the server restarted)' : b.error };
};

/**
 * The agent backtest: the desk run on each past date with only that date's data, then each decision scored on the bars that followed
 * (pessimistic fills, stop wins a tie, in units of R). Distinct from rule backtests, which test fixed conditions on the compute service.
 */
export class DeskBacktests {
  constructor(private readonly desk: TradingDesk, private readonly future: FutureBars, private readonly store: DeskBacktestStore,
    private readonly env: { now: () => number; id: () => string }) {}

  async estimate(userId: string, request: DeskBacktestRequest): Promise<DeskEstimate> {
    const perRun = callsPerRun(request.rounds);
    return { runs: request.dates.length, callsPerRun: perRun, calls: perRun * request.dates.length, tokensEstimate: perRun * request.dates.length * TOKENS_PER_CALL_ESTIMATE,
      dailyRunsLeft: await this.desk.runsLeftToday(userId) };
  }

  /** Starts the backtest in the background and returns at once; progress and results are read with `get`. */
  async start(userId: string, request: DeskBacktestRequest): Promise<DeskBacktestDto> {
    const dates = [...new Set(request.dates)].sort();
    const now = this.env.now();
    if (dates.some(d => decisionTime(d) > now)) throw new ValidationError('A backtest date cannot be in the future');
    if (dates.length > await this.desk.runsLeftToday(userId)) throw new ValidationError(`Only ${String(await this.desk.runsLeftToday(userId))} desk runs are left today; this backtest needs ${String(dates.length)}`);
    const running = (await this.store.list(userId, undefined, 10)).find(b => dto(b, now).status === 'running');
    if (running) throw new ConflictError('A desk backtest is already running; wait for it to finish', { id: running.id });
    const row: StoredBacktest = { id: this.env.id(), userId, symbol: request.symbol, request: { ...request, dates }, status: 'running', done: 0, total: dates.length, items: [], summary: null,
      tokens: 0, createdAt: new Date(now).toISOString(), finishedAt: null, error: null };
    await this.store.insert(row);
    void this.execute(row).catch(() => undefined);
    return dto(row, now);
  }

  async get(userId: string, id: string): Promise<DeskBacktestDto> {
    const row = await this.store.get(userId, id);
    if (!row) throw new NotFoundError('Desk backtest not found', { id });
    return dto(row, this.env.now());
  }

  async list(userId: string, symbol?: string): Promise<DeskBacktestDto[]> { return (await this.store.list(userId, symbol, 20)).map(b => dto(b, this.env.now())); }

  /** Runs the dates in order; a failed date stops the run and keeps what was scored so far. */
  async execute(start: StoredBacktest, signal: AbortSignal = AbortSignal.timeout(2 * 3_600_000)): Promise<void> {
    let row = start;
    try {
      for (const date of start.request.dates) {
        const asOf = decisionTime(date);
        const run = await this.desk.run(start.userId, { symbol: start.symbol, asOf, rounds: start.request.rounds }, signal);
        const bars = run.decision.action === 'HOLD' ? [] : await this.future.after(start.symbol, start.request.interval, asOf, start.request.horizonBars);
        const scored = scoreDecision(run.decision, bars, start.request.horizonBars);
        const item: DeskScored = { asOf: run.asOf, action: run.decision.action, entry: run.decision.entry, stopLoss: run.decision.stopLoss, target: run.decision.target,
          outcome: run.decision.action === 'HOLD' ? 'no-trade' : scored.outcome, r: scored.r, exitPrice: scored.exitPrice, runId: run.id };
        const items = [...row.items, item];
        row = { ...row, items, done: items.length, tokens: row.tokens + run.tokens, summary: summarise(items) };
        await this.store.save(row);
      }
      await this.store.save({ ...row, status: 'done', finishedAt: new Date(this.env.now()).toISOString() });
    } catch (e) {
      await this.store.save({ ...row, status: 'failed', finishedAt: new Date(this.env.now()).toISOString(), error: (e instanceof Error ? e.message : 'The backtest failed').slice(0, 300) });
    }
  }
}
