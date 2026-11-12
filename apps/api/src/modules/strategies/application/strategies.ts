import { createHash } from 'node:crypto';
import { STRATEGY_LIMITS, type BacktestResult, type BacktestSpec, type StrategyDto } from '@aitrader/contracts';
import { ConflictError, NotFoundError } from '../../../shared/errors';
import { canonicalJson } from '../domain/spec-fingerprint';

export interface StoredStrategy { id: string; userId: string; name: string; spec: BacktestSpec; variantHashes: string[]; createdAt: string; updatedAt: string }
export interface StrategyStore {
  list(userId: string): Promise<StoredStrategy[]>;
  get(userId: string, id: string): Promise<StoredStrategy | null>;
  count(userId: string): Promise<number>;
  insert(row: StoredStrategy): Promise<void>;
  update(userId: string, id: string, patch: { name?: string | undefined; spec?: BacktestSpec | undefined; updatedAt: string }): Promise<boolean>;
  remove(userId: string, id: string): Promise<boolean>;
  /** Atomically records a parameter fingerprint if new; returns how many distinct variants the strategy has now. */
  addVariant(userId: string, id: string, hash: string): Promise<number | null>;
}
export interface SpecRunner { run(spec: BacktestSpec, signal?: AbortSignal): Promise<BacktestResult> }

export const fingerprint = (spec: BacktestSpec): string => createHash('sha256').update(canonicalJson(spec)).digest('hex').slice(0, 24);

const dto = (s: StoredStrategy): StrategyDto => ({ id: s.id, name: s.name, spec: s.spec, variants: s.variantHashes.length, createdAt: s.createdAt, updatedAt: s.updatedAt });
const notFound = (): NotFoundError => new NotFoundError('Strategy not found');

/** Saved strategies per user, and runs that count how many parameter variants were tried (FR-BT-2). */
export class Strategies {
  constructor(private readonly store: StrategyStore, private readonly runner: SpecRunner, private readonly env: { id: () => string; now: () => Date }) {}

  async list(userId: string): Promise<{ items: StrategyDto[] }> { return { items: (await this.store.list(userId)).map(dto) }; }

  async create(userId: string, input: { name: string; spec: BacktestSpec }): Promise<StrategyDto> {
    if (await this.store.count(userId) >= STRATEGY_LIMITS.perUser) throw new ConflictError(`You can keep at most ${String(STRATEGY_LIMITS.perUser)} strategies. Delete one first.`);
    const at = this.env.now().toISOString();
    const row: StoredStrategy = { id: this.env.id(), userId, name: input.name, spec: input.spec, variantHashes: [], createdAt: at, updatedAt: at };
    await this.store.insert(row);
    return dto(row);
  }

  async update(userId: string, id: string, patch: { name?: string | undefined; spec?: BacktestSpec | undefined }): Promise<StrategyDto> {
    if (!await this.store.update(userId, id, { ...patch, updatedAt: this.env.now().toISOString() })) throw notFound();
    const row = await this.store.get(userId, id);
    if (!row) throw notFound();
    return dto(row);
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    if (!await this.store.remove(userId, id)) throw notFound();
    return { deleted: true };
  }

  /** Runs the spec. With a saved strategy, a parameter set not tried before makes a new variant; repeating a run does not. */
  async run(userId: string, input: { strategyId?: string | undefined; spec: BacktestSpec }, signal?: AbortSignal): Promise<{ result: BacktestResult; variants: number | null }> {
    if (input.strategyId !== undefined && !await this.store.get(userId, input.strategyId)) throw notFound();
    const result = await this.runner.run(input.spec, signal);
    // Counted after a successful run only: a failed run is not a variant that was tried.
    const variants = input.strategyId === undefined ? null : await this.store.addVariant(userId, input.strategyId, fingerprint(input.spec));
    return { result, variants };
  }
}
