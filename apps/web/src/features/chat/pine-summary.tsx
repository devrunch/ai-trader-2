import type { AgentAction } from '@aitrader/contracts';

type PineAction = Extract<AgentAction, { kind: 'add-pine' }>;

/** What the runtime made of the shared script: its inputs and plots, or the error line. Shown before the user saves or adds it. */
export function PineSummary({ action }: { action: PineAction }) {
  const { check } = action;
  if (!check.ok) return <p role="alert" className="text-down">{check.line ? `Line ${String(check.line)}: ` : ''}{check.error}</p>;
  const { inputs, plots } = check.definition;
  return <ul className="space-y-0.5 text-muted-foreground">
    <li>{check.definition.name}</li>
    <li>Inputs: {inputs.length > 0 ? inputs.map(i => `${i.title} (${String(i.default)})`).join(', ') : 'none'}</li>
    <li>Plots: {plots.length > 0 ? plots.map(p => p.title).join(', ') : 'none'}</li>
    {action.scriptId && <li>Saved to My scripts.</li>}
  </ul>;
}
