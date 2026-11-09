import type { Bar } from '@aitrader/contracts';
import type { ResolvedInputs } from '../../domain/inputs';
import type { PlotValues, RuntimeContext } from '../../application/ports/indicator-runtime';

export interface BarKernel { update(bar: Bar, replace: boolean): PlotValues }
export type BarKernelFactory = (inputs: ResolvedInputs, context: RuntimeContext) => BarKernel;

/** Pine arithmetic on possibly-`na` operands. */
export const minus = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a - b);
