import type { IndicatorDefinition } from '@aitrader/contracts';

/** Describes a script without computing it: the `input.*` calls and plots that become a definition (FR-IN-31). */
export interface ScriptInspector {
  inspect(source: string): Promise<IndicatorDefinition>;
}
