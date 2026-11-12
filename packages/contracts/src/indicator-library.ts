import { z } from 'zod';
import { IndicatorChartInputsSchema, IndicatorInputValuesSchema } from './indicator.js';

/** Saved per user: presets and defaults of a built-in's inputs (FR-IN-12), and whole-chart indicator templates (FR-IN-14). */
export const INDICATOR_PRESETS_MAX = 50;
export const INDICATOR_TEMPLATES_MAX = 30;
export const TEMPLATE_INDICATORS_MAX = 10;

const indicatorId = z.string().regex(/^[a-z][a-z0-9]{0,39}$/);
const name = z.string().trim().min(1).max(60);

export const IndicatorPresetSchema = z.strictObject({
  id: z.uuid(), indicatorId, /** null for the user's default of that indicator. */ name: name.nullable(), inputs: IndicatorInputValuesSchema,
});
export type IndicatorPreset = z.infer<typeof IndicatorPresetSchema>;
export const IndicatorPresetListSchema = z.strictObject({ presets: z.array(IndicatorPresetSchema) });
export const IndicatorPresetCreateSchema = z.strictObject({ indicatorId, name, inputs: IndicatorInputValuesSchema });
export const IndicatorDefaultSetSchema = z.strictObject({ inputs: IndicatorInputValuesSchema });

/** `key` names the item inside the template so a source ref can point at it; applying remaps keys to fresh ones. */
export const TemplateItemSchema = z.strictObject({ key: z.string().min(1).max(100), id: indicatorId, inputs: IndicatorChartInputsSchema });
export type TemplateItem = z.infer<typeof TemplateItemSchema>;
export const IndicatorTemplateSchema = z.strictObject({
  id: z.uuid(), name, favourite: z.boolean(), items: z.array(TemplateItemSchema).max(TEMPLATE_INDICATORS_MAX),
});
export type IndicatorTemplate = z.infer<typeof IndicatorTemplateSchema>;
export const IndicatorTemplateListSchema = z.strictObject({ templates: z.array(IndicatorTemplateSchema) });
export const IndicatorTemplateCreateSchema = z.strictObject({ name, items: z.array(TemplateItemSchema).min(1).max(TEMPLATE_INDICATORS_MAX) });
export const IndicatorTemplatePatchSchema = z.strictObject({ favourite: z.boolean() });
