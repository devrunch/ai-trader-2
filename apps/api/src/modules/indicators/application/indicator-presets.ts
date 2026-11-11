import { INDICATOR_PRESETS_MAX, type IndicatorChartInputs, type IndicatorInputValues, type IndicatorPreset } from '@aitrader/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';

export interface PresetStore {
  list(userId: string): Promise<IndicatorPreset[]>;
  /** Inserts or replaces the user's default for the indicator. */
  saveDefault(userId: string, indicatorId: string, inputs: IndicatorInputValues): Promise<IndicatorPreset>;
  create(userId: string, indicatorId: string, name: string, inputs: IndicatorInputValues): Promise<IndicatorPreset>;
  remove(userId: string, id: string): Promise<boolean>;
}

/** Throws a domain error when the indicator is unknown or an input is out of bounds. */
export type InputsCheck = (indicatorId: string, inputs: IndicatorChartInputs) => void;

/** FR-IN-12: a default and named presets of a built-in's inputs, per user. */
export class IndicatorPresets {
  constructor(private readonly store: PresetStore, private readonly check: InputsCheck) {}

  list(userId: string): Promise<IndicatorPreset[]> { return this.store.list(userId); }

  async saveDefault(userId: string, indicatorId: string, inputs: IndicatorInputValues): Promise<IndicatorPreset> {
    this.check(indicatorId, inputs);
    const existing = await this.store.list(userId);
    if (!existing.some(p => p.indicatorId === indicatorId && p.name === null)) this.assertRoom(existing);
    return this.store.saveDefault(userId, indicatorId, inputs);
  }

  async create(userId: string, indicatorId: string, name: string, inputs: IndicatorInputValues): Promise<IndicatorPreset> {
    this.check(indicatorId, inputs);
    const existing = await this.store.list(userId);
    if (existing.some(p => p.indicatorId === indicatorId && p.name === name)) throw new ConflictError(`A preset named "${name}" already exists`, { name });
    this.assertRoom(existing);
    return this.store.create(userId, indicatorId, name, inputs);
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.store.remove(userId, id))) throw new NotFoundError('Preset not found', { id });
  }

  private assertRoom(existing: readonly IndicatorPreset[]): void {
    if (existing.length >= INDICATOR_PRESETS_MAX) throw new ValidationError(`You can keep at most ${String(INDICATOR_PRESETS_MAX)} presets`, { max: INDICATOR_PRESETS_MAX });
  }
}
