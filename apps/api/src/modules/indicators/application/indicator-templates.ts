import { INDICATOR_TEMPLATES_MAX, isSourceRef, type IndicatorTemplate, type TemplateItem } from '@aitrader/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import type { InputsCheck } from './indicator-presets';

export interface TemplateStore {
  list(userId: string): Promise<IndicatorTemplate[]>;
  create(userId: string, name: string, items: TemplateItem[]): Promise<IndicatorTemplate>;
  setFavourite(userId: string, id: string, favourite: boolean): Promise<IndicatorTemplate | null>;
  remove(userId: string, id: string): Promise<boolean>;
}

/** FR-IN-14: the indicator set of a chart, saved by name; ids and inputs only. */
export class IndicatorTemplates {
  constructor(private readonly store: TemplateStore, private readonly check: InputsCheck) {}

  list(userId: string): Promise<IndicatorTemplate[]> { return this.store.list(userId); }

  async create(userId: string, name: string, items: TemplateItem[]): Promise<IndicatorTemplate> {
    const keys = new Set(items.map(item => item.key));
    if (keys.size !== items.length) throw new ValidationError('Template items need distinct keys', { field: 'items' });
    for (const item of items) {
      for (const value of Object.values(item.inputs)) {
        if (isSourceRef(value) && !keys.has(value.from)) throw new ValidationError('A source points at an indicator outside the template', { key: item.key });
      }
      this.check(item.id, item.inputs);
    }
    const existing = await this.store.list(userId);
    if (existing.some(t => t.name === name)) throw new ConflictError(`A template named "${name}" already exists`, { name });
    if (existing.length >= INDICATOR_TEMPLATES_MAX) throw new ValidationError(`You can keep at most ${String(INDICATOR_TEMPLATES_MAX)} templates`, { max: INDICATOR_TEMPLATES_MAX });
    return this.store.create(userId, name, items);
  }

  async setFavourite(userId: string, id: string, favourite: boolean): Promise<IndicatorTemplate> {
    const updated = await this.store.setFavourite(userId, id, favourite);
    if (!updated) throw new NotFoundError('Template not found', { id });
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.store.remove(userId, id))) throw new NotFoundError('Template not found', { id });
  }
}
