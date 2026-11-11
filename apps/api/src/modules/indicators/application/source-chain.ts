import { INDICATOR_CHAIN_MAX, isSourceRef, type IndicatorComputeRequest, type IndicatorSourceRef, type IndicatorSpec } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';
import { findBuiltin } from '../domain/catalog';
import { UnknownIndicatorError } from '../domain/errors';

/** One indicator in a source chain; `parent` is the indicator whose plot feeds this one's `source` input. */
export interface ChainNode {
  spec: IndicatorSpec; label: string;
  parent?: { inputId: string; ref: IndicatorSourceRef; node: ChainNode };
}

interface Entry { instanceId?: string | undefined; label?: string | undefined; indicator: IndicatorSpec }

/** FR-IN-13: follows `source` refs from the target through the chart's other indicators. Rejects cycles, over-long chains and missing parents. */
export function resolveChain(request: Pick<IndicatorComputeRequest, 'indicator' | 'instanceId' | 'label' | 'others'>): ChainNode {
  const target: Entry = { indicator: request.indicator, instanceId: request.instanceId, label: request.label };
  // The target is findable too, so a parent that points back at it is a cycle rather than a missing source.
  const known = [...(request.instanceId === undefined ? [] : [target]), ...(request.others ?? [])];
  return visit(target, known, []);
}

function visit(entry: Entry, others: readonly Entry[], path: readonly Entry[]): ChainNode {
  const label = nameOf(entry);
  if (entry.instanceId !== undefined) {
    const start = path.findIndex(p => p.instanceId === entry.instanceId);
    if (start >= 0) {
      const cycle = [...path.slice(start), entry].map(nameOf);
      throw new ValidationError(`Indicators form a cycle: ${cycle.join(' -> ')}`, { reason: 'SOURCE_CYCLE', indicators: cycle });
    }
  }
  const refs = Object.entries(entry.indicator.inputs).filter((pair): pair is [string, IndicatorSourceRef] => isSourceRef(pair[1]));
  const first = refs[0];
  if (!first) return { spec: entry.indicator, label };
  if (refs.length > 1) throw new ValidationError(`${label}: only one input can take another indicator`, { reason: 'SOURCE_INVALID', inputs: refs.map(([id]) => id) });
  if (entry.indicator.kind !== 'builtin') throw new ValidationError(`${label}: Pine scripts cannot take another indicator as source yet`, { reason: 'UNSUPPORTED' });
  const [inputId, ref] = first;
  const parent = others.find(other => other.instanceId === ref.from);
  if (!parent) throw new ValidationError(`${label}: source unavailable, indicator "${ref.from}" is not on the chart`, { reason: 'SOURCE_UNAVAILABLE', input: inputId, from: ref.from });
  if (path.length + 2 > INDICATOR_CHAIN_MAX) {
    throw new ValidationError(`${label}: sources are chained more than ${String(INDICATOR_CHAIN_MAX)} deep`, { reason: 'SOURCE_TOO_DEEP', max: INDICATOR_CHAIN_MAX });
  }
  requirePlot(parent, ref, label);
  return { spec: entry.indicator, label, parent: { inputId, ref, node: visit(parent, others, [...path, entry]) } };
}

function requirePlot(parent: Entry, ref: IndicatorSourceRef, childLabel: string): void {
  if (parent.indicator.kind !== 'builtin') return;
  try {
    const plots = findBuiltin(parent.indicator.id, parent.indicator.version).definition.plots;
    if (!plots.some(plot => plot.id === ref.plot)) {
      throw new ValidationError(`${childLabel}: ${nameOf(parent)} has no plot "${ref.plot}"`, { reason: 'SOURCE_INVALID', from: ref.from, plot: ref.plot });
    }
  } catch (error) {
    if (error instanceof UnknownIndicatorError) throw new ValidationError(error.message, { reason: 'SOURCE_INVALID', from: ref.from });
    throw error;
  }
}

function nameOf(entry: Entry): string {
  return entry.label ?? entry.instanceId ?? (entry.indicator.kind === 'builtin' ? entry.indicator.id : 'pine');
}
