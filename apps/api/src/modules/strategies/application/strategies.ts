import { createHash } from 'node:crypto';
import { STRATEGY_LIMITS, type BacktestResult, type BacktestSpec, type StrategyDto } from '@aitrader/contracts';
import { SavedSpecs, type SpecEnv, type SpecStore, type StoredSpec } from '../../../shared/saved-specs';
import { canonicalJson } from '../domain/spec-fingerprint';

export interface StoredStrategy extends StoredSpec<BacktestSpec> { variantHashes: string[] }
export interface StrategyStore extends SpecStore<BacktestSpec, StoredStrategy> {
  /** Atomically records a parameter fingerprint if new; returns how many distinct variants the strategy has now. */
  addVariant(userId: string, id: string, hash: string): Promise<number | null>;
}
export interface SpecRunner { run(spec: BacktestSpec, signal?: AbortSignal): Promise<BacktestResult> }

export const fingerprint = (spec: BacktestSpec): string => createHash('sha256').update(canonicalJson(spec)).digest('hex').slice(0, 24);

const dto = (s: StoredStrategy): StrategyDto => ({ id: s.id, name: s.name, spec: s.spec, variants: s.variantHashes.length, createdAt: s.createdAt, updatedAt: s.updatedAt });

/** Saved strategies per user, and runs that count how many parameter variants were tried (FR-BT-2). */
export class Strategies extends SavedSpecs<BacktestSpec, StoredStrategy, StrategyDto> {
  constructor(private readonly strategyStore: StrategyStore, private readonly runner: SpecRunner, env: SpecEnv) {
    super(strategyStore, env, { limit: STRATEGY_LIMITS.perUser, plural: 'strategies', singular: 'Strategy', toDto: dto, newRow: base => ({ ...base, variantHashes: [] }) });
  }

  /** Runs the spec. With a saved strategy, a parameter set not tried before makes a new variant; repeating a run does not. */
  async run(userId: string, input: { strategyId?: string | undefined; spec: BacktestSpec }, signal?: AbortSignal): Promise<{ result: BacktestResult; variants: number | null }> {
    if (input.strategyId !== undefined && !await this.strategyStore.get(userId, input.strategyId)) throw this.notFound();
    const result = await this.runner.run(input.spec, signal);
    // Counted after a successful run only: a failed run is not a variant that was tried.
    const variants = input.strategyId === undefined ? null : await this.strategyStore.addVariant(userId, input.strategyId, fingerprint(input.spec));
    return { result, variants };
  }
}
