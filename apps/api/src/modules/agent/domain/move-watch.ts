import type { TaskTrigger } from '@aitrader/contracts';
import type { AgentTask, Fresh } from './agent-task';

export type MoveWatch = Extract<TaskTrigger, { kind: 'move' }>;
/** Instruments one move watch looks at; more than this costs too much per tick. */
const MAX_MOVE_SYMBOLS = 200;
const MAX_LISTED = 8;

/** The instruments a move watch looks at: its own symbols, then the members of its universe, without repeats. */
export const moveSymbols = (trigger: Pick<MoveWatch, 'symbols'>, members: string[]): string[] => [...new Set([...trigger.symbols, ...members])].slice(0, MAX_MOVE_SYMBOLS);

const istHour = (ms: number): string => new Date(ms + 330 * 60_000).toISOString().slice(0, 13);
const moveKey = (symbol: string, now: number): string => `${symbol}:${istHour(now)}`;

const hits = (trigger: MoveWatch, change: number): boolean => (trigger.direction === 'up' ? change >= trigger.minPct : trigger.direction === 'down' ? change <= -trigger.minPct : Math.abs(change) >= trigger.minPct);

/**
 * Instruments that moved at least `minPct` over the window, one report per instrument per IST hour (`<symbol>:<hour>` is remembered).
 * One wake-up lists them all, strongest first; an instrument without data never fires.
 */
export function freshMoves(task: Pick<AgentTask, 'seen'>, trigger: MoveWatch, changes: Map<string, number | null>, members: string[], now: number): Fresh | null {
  const found = moveSymbols(trigger, members).flatMap(symbol => {
    const change = changes.get(symbol);
    return change != null && hits(trigger, change) && !task.seen.includes(moveKey(symbol, now)) ? [{ symbol, change }] : [];
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const [top] = found;
  if (!top) return null;
  const lines = found.slice(0, MAX_LISTED).map(f => `- ${f.symbol} ${f.change >= 0 ? '+' : ''}${f.change.toFixed(2)}% in ${String(trigger.minutes)} min`);
  const more = found.length > MAX_LISTED ? `\n- and ${String(found.length - MAX_LISTED)} more` : '';
  const way = trigger.direction === 'either' ? 'moved' : trigger.direction === 'up' ? 'rose' : 'fell';
  return { ids: found.map(f => moveKey(f.symbol, now)), deskSymbol: top.symbol,
    reason: `${String(found.length)} instrument${found.length === 1 ? '' : 's'} ${way} at least ${String(trigger.minPct)}% within ${String(trigger.minutes)} minutes:\n${lines.join('\n')}${more}` };
}
