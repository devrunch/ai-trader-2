import type { UIMessage } from 'ai';
import { ActionCardSchema } from '@aitrader/contracts';
import { ActionCard } from './action-card';
import { ChatMarkdown } from './markdown';

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
    if (isTool(part)) {
      const proposed = part.type === 'tool-proposeChartAction' || part.type === 'tool-proposeDrawing' ? proposal(part.output) : null;
      return proposed ? <ActionCard key={i} proposed={proposed} /> : <ToolCard key={i} part={part} />;
    }
    return null;
  })}</div>;
}

/** A successful proposeChartAction result carries the card; anything else shows as a plain tool card. */
function proposal(output: unknown) {
  if (typeof output !== 'object' || output === null || !('ok' in output) || output.ok !== true || !('data' in output)) return null;
  const parsed = ActionCardSchema.safeParse(output.data);
  return parsed.success ? parsed.data : null;
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
