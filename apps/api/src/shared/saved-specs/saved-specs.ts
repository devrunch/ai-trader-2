import { ConflictError, NotFoundError } from '../errors';

export interface StoredSpec<S> { id: string; userId: string; name: string; spec: S; createdAt: string; updatedAt: string }
export interface SpecPatch<S> { name?: string | undefined; spec?: S | undefined; updatedAt: string }
export interface SpecStore<S, R extends StoredSpec<S>> {
  list(userId: string): Promise<R[]>;
  get(userId: string, id: string): Promise<R | null>;
  count(userId: string): Promise<number>;
  insert(row: R): Promise<void>;
  update(userId: string, id: string, patch: SpecPatch<S>): Promise<boolean>;
  remove(userId: string, id: string): Promise<boolean>;
}
export interface SpecEnv { id: () => string; now: () => Date }
export interface SavedSpecsConfig<S, R extends StoredSpec<S>, D> {
  limit: number;
  /** Plural noun for the cap message, and the singular for not-found. */
  plural: string;
  singular: string;
  toDto: (row: R) => D;
  /** Adds the table's own fields to a freshly built row. */
  newRow: (base: StoredSpec<S>) => R;
}

/** A user's saved specs: capped per user and isolated by owner. */
export class SavedSpecs<S, R extends StoredSpec<S>, D> {
  constructor(protected readonly store: SpecStore<S, R>, protected readonly env: SpecEnv, private readonly cfg: SavedSpecsConfig<S, R, D>) {}

  protected notFound(): NotFoundError { return new NotFoundError(`${this.cfg.singular} not found`); }

  async list(userId: string): Promise<{ items: D[] }> { return { items: (await this.store.list(userId)).map(this.cfg.toDto) }; }

  async create(userId: string, input: { name: string; spec: S }): Promise<D> {
    if (await this.store.count(userId) >= this.cfg.limit) throw new ConflictError(`You can keep at most ${String(this.cfg.limit)} ${this.cfg.plural}. Delete one first.`);
    const at = this.env.now().toISOString();
    const row = this.cfg.newRow({ id: this.env.id(), userId, name: input.name, spec: input.spec, createdAt: at, updatedAt: at });
    await this.store.insert(row);
    return this.cfg.toDto(row);
  }

  async update(userId: string, id: string, patch: { name?: string | undefined; spec?: S | undefined }): Promise<D> {
    if (!await this.store.update(userId, id, { ...patch, updatedAt: this.env.now().toISOString() })) throw this.notFound();
    const row = await this.store.get(userId, id);
    if (!row) throw this.notFound();
    return this.cfg.toDto(row);
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    if (!await this.store.remove(userId, id)) throw this.notFound();
    return { deleted: true };
  }
}
