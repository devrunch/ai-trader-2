import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import type { IndicatorInputValues, IndicatorPreset, IndicatorTemplate, TemplateItem } from '@aitrader/contracts';
import type { Database } from '../../../shared/database';
import { indicatorPresets, indicatorTemplates } from '../../../shared/database/schema';
import type { PresetStore } from '../application/indicator-presets';
import type { TemplateStore } from '../application/indicator-templates';

const TIMEOUT = 5000;
const preset = (row: typeof indicatorPresets.$inferSelect): IndicatorPreset => ({ id: row.id, indicatorId: row.indicatorId, name: row.name, inputs: row.inputs });
const template = (row: typeof indicatorTemplates.$inferSelect): IndicatorTemplate => ({ id: row.id, name: row.name, favourite: row.favourite, items: row.items });

export class DrizzlePresetStore implements PresetStore {
  constructor(private readonly db: Database) {}

  async list(userId: string): Promise<IndicatorPreset[]> {
    const rows = await withTimeout(() => this.db.select().from(indicatorPresets).where(eq(indicatorPresets.userId, userId))
      .orderBy(asc(indicatorPresets.indicatorId), asc(indicatorPresets.name)), TIMEOUT);
    return rows.map(preset);
  }

  async saveDefault(userId: string, indicatorId: string, inputs: IndicatorInputValues): Promise<IndicatorPreset> {
    const where = and(eq(indicatorPresets.userId, userId), eq(indicatorPresets.indicatorId, indicatorId), isNull(indicatorPresets.name));
    const [updated] = await withTimeout(() => this.db.update(indicatorPresets).set({ inputs, updatedAt: sql`now()` }).where(where).returning(), TIMEOUT);
    return updated ? preset(updated) : this.insert(userId, indicatorId, null, inputs);
  }

  create(userId: string, indicatorId: string, name: string, inputs: IndicatorInputValues): Promise<IndicatorPreset> {
    return this.insert(userId, indicatorId, name, inputs);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = await withTimeout(() => this.db.delete(indicatorPresets).where(and(eq(indicatorPresets.id, id), eq(indicatorPresets.userId, userId))).returning({ id: indicatorPresets.id }), TIMEOUT);
    return rows.length > 0;
  }

  private async insert(userId: string, indicatorId: string, name: string | null, inputs: IndicatorInputValues): Promise<IndicatorPreset> {
    const [row] = await withTimeout(() => this.db.insert(indicatorPresets).values({ userId, indicatorId, name, inputs }).returning(), TIMEOUT);
    if (!row) throw new Error('Preset insert returned no row');
    return preset(row);
  }
}

export class DrizzleTemplateStore implements TemplateStore {
  constructor(private readonly db: Database) {}

  async list(userId: string): Promise<IndicatorTemplate[]> {
    const rows = await withTimeout(() => this.db.select().from(indicatorTemplates).where(eq(indicatorTemplates.userId, userId)).orderBy(asc(indicatorTemplates.name)), TIMEOUT);
    return rows.map(template);
  }

  async create(userId: string, name: string, items: TemplateItem[]): Promise<IndicatorTemplate> {
    const [row] = await withTimeout(() => this.db.insert(indicatorTemplates).values({ userId, name, items }).returning(), TIMEOUT);
    if (!row) throw new Error('Template insert returned no row');
    return template(row);
  }

  async setFavourite(userId: string, id: string, favourite: boolean): Promise<IndicatorTemplate | null> {
    const [row] = await withTimeout(() => this.db.update(indicatorTemplates).set({ favourite, updatedAt: sql`now()` })
      .where(and(eq(indicatorTemplates.id, id), eq(indicatorTemplates.userId, userId))).returning(), TIMEOUT);
    return row ? template(row) : null;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = await withTimeout(() => this.db.delete(indicatorTemplates).where(and(eq(indicatorTemplates.id, id), eq(indicatorTemplates.userId, userId))).returning({ id: indicatorTemplates.id }), TIMEOUT);
    return rows.length > 0;
  }
}
