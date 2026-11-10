import { ValidationError } from '../../../shared/errors';
import type { IndicatorProgram, IndicatorRuntime } from './ports/indicator-runtime';

/** FR-IN-31: the first runtime that can run the program wins; native is listed first so built-ins take the fast path. */
export class RuntimeResolver {
  constructor(private readonly runtimes: readonly IndicatorRuntime[]) {}

  resolve(program: IndicatorProgram): IndicatorRuntime {
    const runtime = this.runtimes.find(candidate => candidate.supports(program));
    if (!runtime) throw new ValidationError(program.kind === 'pine' ? 'Pine scripts cannot run yet' : 'No runtime for this indicator', { reason: 'UNSUPPORTED' });
    return runtime;
  }
}
