import type { AgentProfile } from '@aitrader/contracts';

export interface Signal { kind: string; topic: string; tools: string[] }

const POSITIVE = new Set(['card-applied', 'thumb-up']);
const NEGATIVE = new Set(['card-dismissed', 'thumb-down']);
const MAX_TOPICS = 8;
const MAX_CHARS = 1000;

/** Fields in the patch replace the stored ones; a field set to null is removed. */
export function mergeProfile(current: AgentProfile, patch: Record<string, unknown>): Record<string, unknown> {
  const removed = (value: unknown): boolean => value === null || value === undefined || (Array.isArray(value) && value.length === 0);
  return Object.fromEntries(Object.entries({ ...current, ...patch }).filter(([, value]) => !removed(value)));
}

/** The topic of an answer: the loadable group of the first tool that has one, otherwise "general". */
export function topicOf(tools: string[], groupOf: (tool: string) => string | undefined): string {
  for (const tool of tools) {
    const group = groupOf(tool);
    if (group) return group;
  }
  return 'general';
}

/** "What works for this user": per kind of question, how often answers were accepted or rejected and which tools were behind the accepted ones. Same data, same text. */
export function summarizeSignals(signals: Signal[]): string {
  const topics = new Map<string, { up: number; down: number; tools: Map<string, number> }>();
  for (const s of signals) {
    const good = POSITIVE.has(s.kind);
    if (!good && !NEGATIVE.has(s.kind)) continue;
    const t = topics.get(s.topic) ?? { up: 0, down: 0, tools: new Map<string, number>() };
    if (good) t.up++; else t.down++;
    for (const tool of new Set(s.tools)) t.tools.set(tool, (t.tools.get(tool) ?? 0) + (good ? 1 : -1));
    topics.set(s.topic, t);
  }
  const lines = [...topics.entries()]
    .sort(([a, x], [b, y]) => (y.up + y.down) - (x.up + x.down) || a.localeCompare(b))
    .slice(0, MAX_TOPICS)
    .map(([topic, t]) => {
      const best = [...t.tools.entries()].filter(([, n]) => n > 0).sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).slice(0, 3).map(([tool]) => tool);
      return `- ${topic}: ${String(t.up)} accepted, ${String(t.down)} rejected${best.length ? `; worked: ${best.join(', ')}` : ''}`;
    });
  return lines.join('\n').slice(0, MAX_CHARS);
}

const STYLE: Record<string, string> = { short: 'short answers', detailed: 'detailed answers', cards: 'trade cards over prose', text: 'plain text over cards' };

/** The profile as one short line per fact, for the prompt. Empty when nothing is set. */
export function describeProfile(p: AgentProfile): string {
  const lines: string[] = [];
  if (p.markets?.length) lines.push(`Markets: ${p.markets.join(', ')}`);
  if (p.instruments?.length) lines.push(`Instruments: ${p.instruments.join(', ')}`);
  if (p.timeframes?.length) lines.push(`Timeframes: ${p.timeframes.join(', ')}`);
  if (p.riskPerTradePct !== undefined) lines.push(`Risk per trade: ${String(p.riskPerTradePct)}%`);
  if (p.autonomy) lines.push(p.autonomy === 'ask' ? 'Paper trades: ask before every order' : 'Paper trades: may act on its own inside the risk limits');
  const style = [p.length, p.format].flatMap(v => (v ? [STYLE[v]] : []));
  if (style.length) lines.push(`Prefers: ${style.join(', ')}`);
  if (p.language) lines.push(`Language: ${p.language}`);
  return lines.join('\n');
}
