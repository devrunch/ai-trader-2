import type { IndicatorDefinition } from '@aitrader/contracts';
import type { PineProblem } from './pine-problems';

/** Result of Check: the inputs and plots the script declares, or the error with its line. */
export function PineCheckSummary({ definition, problem, pending }: { definition: IndicatorDefinition | undefined; problem: PineProblem | undefined; pending: boolean }) {
  if (pending) return <p role="status" className="text-[12px] text-muted-foreground">Checking the script</p>;
  if (problem) return <p role="alert" className="text-[12px] text-destructive">{problem.line === undefined ? '' : `Line ${String(problem.line)}: `}{problem.message}</p>;
  if (!definition) return <p className="text-[12px] text-muted-foreground">Check the script to see its inputs and plots.</p>;
  return <p role="status" className="text-[12px] text-muted-foreground">
    OK. Inputs: {definition.inputs.length === 0 ? 'none' : definition.inputs.map(i => i.title).join(', ')}. Plots: {definition.plots.map(p => p.title).join(', ')}.
  </p>;
}
