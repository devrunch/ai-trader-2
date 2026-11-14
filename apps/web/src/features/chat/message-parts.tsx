import type { UIMessage } from 'ai';
import { z } from 'zod';
import { ActionCardSchema, ChatViewSchema, CustomViewSchema, TradePlanSchema } from '@aitrader/contracts';
import { ActionCard } from './action-card';
import { TradePlanCard } from './trade-plan-card';
import { ChatViewCard, CustomViewFrame } from './chat-view';
import { ChatMarkdown } from './markdown';

/** What askDesk returns: a plan card for a BUY or SELL, otherwise the reasons. */
const DeskAnswerSchema = z.looseObject({ plan: TradePlanSchema.nullable() });
type Part = UIMessage['parts'][number];
interface ToolLike { type: string; state?: string; input?: unknown; output?: unknown; errorText?: string }
interface NoticeLike { type: 'data-notice'; data: { text?: string } }

const isTool = (part: Part): part is Part & ToolLike => part.type.startsWith('tool-') || part.type === 'dynamic-tool';
const isNotice = (part: Part): part is Part & NoticeLike => part.type === 'data-notice';

/** Text, the data the assistant used (tool cards), and budget notices. */
const PLAIN: Record<string, string> = {
  getQuote: 'price', getBars: 'chart', getIndicator: 'indicators', getNews: 'news', getSentiment: 'mood', getCrowd: 'crowd chatter', getFundamentals: 'fundamentals',
  getEconomicCalendar: 'calendar', getEventScorecard: 'past reactions', getDepth: 'order book', getMarketStatus: 'market hours', getPortfolio: 'your positions',
  getWatchlist: 'your watchlist', searchInstruments: 'symbol search', listUniverse: 'market lists', scanUniverse: 'scan', webSearch: 'web search', calculate: 'calculations',
  runBacktest: 'backtest', getOptionChain: 'options', getOptionsSummary: 'options', listIndicators: 'indicators',
};
const HIDDEN = new Set(['loadTools', 'listSkills']);

/** The data the assistant looked at for one answer, in one line that opens to the detail. */
function ToolTrail({ parts }: { parts: Array<Part & ToolLike> }) {
  const counts = new Map<string, number>();
  for (const p of parts) { const name = p.type.replace(/^tool-/, ''); if (HIDDEN.has(name)) continue; const label = PLAIN[name] ?? name; counts.set(label, (counts.get(label) ?? 0) + 1); }
  const working = parts.some(p => p.state !== 'output-available' && p.state !== 'output-error');
  const summary = [...counts].map(([label, n]) => (n > 1 && (label === 'calculations' || label === 'indicators') ? `${String(n)} ${label}` : label)).join(', ');
  if (summary === '') return null;
  return <details className={`text-xs text-muted-foreground ${working ? 'ai-working' : ''}`}>
    <summary className="cursor-pointer list-none">{working ? 'Checking ' : 'Checked '}{summary} {'\u25b8'}</summary>
    <div className="mt-1 space-y-1">{parts.filter(p => !HIDDEN.has(p.type.replace(/^tool-/, ''))).map((p, i) => <ToolCard key={i} part={p} />)}</div>
  </details>;
}

const isPlainTool = (part: Part): part is Part & ToolLike => isTool(part) && part.type !== 'tool-useSkill' && part.type !== 'tool-presentTradePlan' && part.type !== 'tool-askDesk'
  && part.type !== 'tool-proposeChartAction' && part.type !== 'tool-proposeDrawing' && part.type !== 'tool-showView' && part.type !== 'tool-showCustomView';

export function MessageParts({ parts, role }: { parts: UIMessage['parts']; role: UIMessage['role'] }) {
  // Runs of plain data lookups become one trail; everything the user acts on (cards, text, notices) stays as it is.
  const groups: Array<Part | Array<Part & ToolLike>> = [];
  for (const part of parts) {
    const last = groups.at(-1);
    if (isPlainTool(part)) { if (Array.isArray(last)) last.push(part); else groups.push([part]); } else groups.push(part);
  }
  return <div className="min-w-0 space-y-2">{groups.map((group, i) => {
    if (Array.isArray(group)) return <ToolTrail key={i} parts={group} />;
    const part = group;
    if (part.type === 'text') return role === 'user' ? <p key={i} className="whitespace-pre-wrap">{part.text}</p> : <ChatMarkdown key={i} text={part.text} />;
    if (isNotice(part)) return <p key={i} role="status" className="rounded border border-dashed p-2 text-muted-foreground">{part.data.text}</p>;
    if (isTool(part) && part.type === 'tool-useSkill') return <SkillChip key={i} part={part} />;
    if (isTool(part) && part.type === 'tool-showView') { const view = okData(part.output, ChatViewSchema); if (view) return <ChatViewCard key={i} view={view} />; }
    if (isTool(part) && part.type === 'tool-showCustomView') { const view = okData(part.output, CustomViewSchema); if (view) return <CustomViewFrame key={i} view={view} />; }
    if (isTool(part) && (part.type === 'tool-presentTradePlan' || part.type === 'tool-askDesk')) {
      const plan = part.type === 'tool-askDesk' ? okData(part.output, DeskAnswerSchema)?.plan : okData(part.output, TradePlanSchema);
      if (plan) return <TradePlanCard key={i} plan={plan} />;
    }
    if (isTool(part)) {
      const proposed = part.type === 'tool-proposeChartAction' || part.type === 'tool-proposeDrawing' ? proposal(part.output) : null;
      return proposed ? <ActionCard key={i} proposed={proposed} /> : <ToolCard key={i} part={part} />;
    }
    return null;
  })}</div>;
}

/** The data of a successful tool result, when it has the expected shape. */
function okData<T>(output: unknown, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }): T | null {
  if (typeof output !== 'object' || output === null || !('ok' in output) || output.ok !== true || !('data' in output)) return null;
  const parsed = schema.safeParse(output.data);
  return parsed.success ? parsed.data : null;
}

/** A successful proposeChartAction result carries the card; anything else shows as a plain tool card. */
function proposal(output: unknown) {
  if (typeof output !== 'object' || output === null || !('ok' in output) || output.ok !== true || !('data' in output)) return null;
  const parsed = ActionCardSchema.safeParse(output.data);
  return parsed.success ? parsed.data : null;
}

/** A playbook the assistant is following, by name and version, so the user can see which skill shaped the answer. */
function SkillChip({ part }: { part: ToolLike }) {
  const out = part.output;
  const data = typeof out === 'object' && out !== null && 'ok' in out && out.ok === true && 'data' in out ? out.data : undefined;
  const skill = typeof data === 'object' && data !== null && 'content' in data && typeof data.content === 'string' ? data as { content: string; version?: number } : undefined;
  const title = skill?.content.split('\n').find(l => l.startsWith('#'))?.replace(/^#+\s*/, '');
  const asked = typeof part.input === 'object' && part.input !== null && 'name' in part.input && typeof part.input.name === 'string' ? part.input.name : 'skill';
  return <p role="status" className="inline-flex items-center gap-1.5 border border-accent/50 px-2 py-0.5 text-xs">
    <span className="text-muted-foreground">Using</span><span className="font-semibold">{title ?? asked}</span>
    {skill?.version !== undefined && <span className="text-muted-foreground">v{skill.version}</span>}
  </p>;
}

function ToolCard({ part }: { part: ToolLike }) {
  const name = part.type.replace(/^tool-/, '');
  const failed = part.state === 'output-error' || (typeof part.output === 'object' && part.output !== null && 'ok' in part.output && part.output.ok === false);
  const label = part.state === 'output-available' || part.state === 'output-error' ? (failed ? 'failed' : 'data used') : 'reading…';
  return <details className="rounded border px-2 py-1 text-xs">
    <summary className="cursor-pointer"><span className="font-mono">{name}</span> <span className={failed ? 'text-down' : 'text-muted-foreground'}>{label}</span></summary>
    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify({ input: part.input, output: part.output ?? part.errorText }, null, 2)}</pre>
  </details>;
}
