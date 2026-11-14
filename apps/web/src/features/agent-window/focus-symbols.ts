import type { UIMessage } from 'ai';

/** The assistant's latest call on a symbol, read from the trade cards and desk results in the conversation. */
export interface FocusView { action: 'BUY' | 'SELL' | 'HOLD'; confidence: number | null; entry: number | null; stopLoss: number | null; target: number | null }

const SYMBOL = /\b[A-Z]{2,8}:[A-Z0-9][A-Z0-9&._!-]{0,30}/g;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function symbolsIn(value: unknown, out: string[]): void {
  if (typeof value === 'string') { for (const m of value.matchAll(SYMBOL)) out.push(m[0]); return; }
  if (Array.isArray(value)) { for (const v of value) symbolsIn(v, out); return; }
  if (isRecord(value)) for (const [k, v] of Object.entries(value)) if (k === 'symbol' || k === 'symbols' || k === 'instrumentId' || k === 'text') symbolsIn(v, out);
}

/** A trade card (`presentTradePlan`) or a desk decision (`askDesk`) in a tool result, as the assistant's view. */
function viewOf(part: Record<string, unknown>): [string, FocusView] | null {
  if (part.type !== 'tool-presentTradePlan' && part.type !== 'tool-askDesk') return null;
  const out = part.output;
  const data = isRecord(out) && out.ok === true && isRecord(out.data) ? out.data : null;
  if (!data || typeof data.symbol !== 'string') return null;
  const decision = isRecord(data.decision) ? data.decision : data;
  const side = typeof data.side === 'string' ? data.side.toUpperCase() : typeof decision.action === 'string' ? decision.action : 'HOLD';
  const targets = Array.isArray(data.targets) ? data.targets : [];
  return [data.symbol, { action: side === 'BUY' || side === 'SELL' ? side : 'HOLD', confidence: num(decision.confidence ?? data.confidence),
    entry: num(decision.entry ?? data.entry), stopLoss: num(decision.stopLoss ?? data.stopLoss), target: num(decision.target ?? targets[0]) }];
}

/** The stocks a conversation is about, newest mention first, and the assistant's latest call on each. */
export function focusFrom(messages: UIMessage[], limit = 8): { symbols: string[]; views: Map<string, FocusView> } {
  const order: string[] = [];
  const views = new Map<string, FocusView>();
  for (const message of messages) {
    for (const raw of message.parts) {
      const part = raw as unknown as Record<string, unknown>;
      const found: string[] = [];
      if (part.type === 'text') symbolsIn(part.text, found);
      else { symbolsIn(part.input, found); symbolsIn(isRecord(part.output) ? part.output.data : undefined, found); }
      for (const s of found) { const i = order.indexOf(s); if (i >= 0) order.splice(i, 1); order.push(s); }
      const view = viewOf(part);
      if (view) views.set(view[0], view[1]);
    }
  }
  return { symbols: order.reverse().slice(0, limit), views };
}
