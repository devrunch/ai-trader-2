import type { UIMessage } from 'ai';
import { z } from 'zod';
import { ActionCardSchema, TradePlanSchema } from '@aitrader/contracts';
import { ActionCard } from './action-card';
import { TradePlanCard } from './trade-plan-card';
import { ChatMarkdown } from './markdown';

/** What askDesk returns: a plan card for a BUY or SELL, otherwise the reasons. */
const DeskAnswerSchema = z.looseObject({ plan: TradePlanSchema.nullable() });
type Part = UIMessage['parts'][number];
interface ToolLike { type: string; state?: string; input?: unknown; output?: unknown; errorText?: string }
interface NoticeLike { type: 'data-notice'; data: { text?: string } }

const isTool = (part: Part): part is Part & ToolLike => part.type.startsWith('tool-') || part.type === 'dynamic-tool';
const isNotice = (part: Part): part is Part & NoticeLike => part.type === 'data-notice';

/** Text, the data the assistant used (tool cards), and budget notices. */
export function MessageParts({ parts, role }: { parts: UIMessage['parts']; role: UIMessage['role'] }) {
  return <div className="space-y-2">{parts.map((part, i) => {
    if (part.type === 'text') return role === 'user' ? <p key={i} className="whitespace-pre-wrap">{part.text}</p> : <ChatMarkdown key={i} text={part.text} />;
    if (isNotice(part)) return <p key={i} role="status" className="rounded border border-dashed p-2 text-muted-foreground">{part.data.text}</p>;
    if (isTool(part) && part.type === 'tool-useSkill') return <SkillChip key={i} part={part} />;
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
    <span className="text-muted-foreground">Following</span><span className="font-semibold">{title ?? asked}</span>
    {skill?.version !== undefined && <span className="text-muted-foreground">v{skill.version}</span>}
    {!skill && part.state === 'output-available' && <span className="text-down">not found</span>}
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
