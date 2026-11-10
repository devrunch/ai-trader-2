import type { UIMessage } from 'ai';

type Part = UIMessage['parts'][number];
interface ToolLike { type: string; state?: string; input?: unknown; output?: unknown; errorText?: string }
interface NoticeLike { type: 'data-notice'; data: { text?: string } }

const isTool = (part: Part): part is Part & ToolLike => part.type.startsWith('tool-') || part.type === 'dynamic-tool';
const isNotice = (part: Part): part is Part & NoticeLike => part.type === 'data-notice';

/** Text, the data the assistant used (tool cards), and budget notices. */
export function MessageParts({ parts }: { parts: UIMessage['parts'] }) {
  return <div className="space-y-2">{parts.map((part, i) => {
    if (part.type === 'text') return <p key={i} className="whitespace-pre-wrap">{part.text}</p>;
    if (isNotice(part)) return <p key={i} role="status" className="rounded border border-dashed p-2 text-muted-foreground">{part.data.text}</p>;
    if (isTool(part)) return <ToolCard key={i} part={part} />;
    return null;
  })}</div>;
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
