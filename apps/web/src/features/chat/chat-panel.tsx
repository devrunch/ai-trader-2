import { useChat } from '@ai-sdk/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useMemo, useState, type SyntheticEvent } from 'react';
import { z } from 'zod';
import { AgentStatusSchema, ThreadSummarySchema } from '@aitrader/contracts';
import { API_HEADERS, apiFetch, apiUrl } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { ChatActionsContext, type ChatActions } from './chat-actions';
import { MessageParts } from './message-parts';

const threadsSchema = z.array(ThreadSummarySchema);
const messagesSchema = z.array(z.looseObject({ id: z.string(), role: z.enum(['user', 'assistant', 'system']), parts: z.array(z.looseObject({ type: z.string() })) }));
const noContent = z.unknown();

/** The assistant tab (FR-AG-8, FR-AG-9): threads on top, the conversation below. Read-only advice; it never trades. */
export function ChatPanel({ actions }: { actions?: ChatActions }) {
  const status = useQuery({ queryKey: ['agent', 'status'], queryFn: ({ signal }) => apiFetch('/v1/agent/status', { schema: AgentStatusSchema, signal }) });
  const [threadId, setThreadId] = useState<string>(() => crypto.randomUUID());
  if (status.isPending) return <p className="text-sm text-muted-foreground">Loading assistant…</p>;
  if (status.isError) return <p role="alert" className="text-sm text-down">The assistant is unreachable. Try again shortly.</p>;
  if (!status.data.enabled) {
    return <div className="space-y-2 text-sm"><h2 className="font-medium">Assistant</h2>
      <p className="text-muted-foreground">The assistant is not configured on this server. An admin sets <code>AGENT_MODEL</code> and its provider key in <code>apps/api/.env</code>.</p></div>;
  }
  const body = <div className="flex h-full min-h-0 flex-col gap-3 text-sm">
    <ThreadBar current={threadId} onSelect={setThreadId} />
    <Conversation key={threadId} threadId={threadId} model={status.data.model} />
  </div>;
  return actions ? <ChatActionsContext value={actions}>{body}</ChatActionsContext> : body;
}

function ThreadBar({ current, onSelect }: { current: string; onSelect: (id: string) => void }) {
  const client = useQueryClient();
  const threads = useQuery({ queryKey: ['agent', 'threads'], queryFn: ({ signal }) => apiFetch('/v1/agent/threads', { schema: threadsSchema, signal }) });
  const refresh = () => client.invalidateQueries({ queryKey: ['agent', 'threads'] });
  const rename = useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => apiFetch(`/v1/agent/threads/${id}`, { schema: noContent, method: 'PATCH', body: { title } }), onSuccess: () => { void refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => apiFetch(`/v1/agent/threads/${id}`, { schema: noContent, method: 'DELETE' }),
    onSuccess: (_data, id) => { if (id === current) onSelect(crypto.randomUUID()); void refresh(); } });
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const list = threads.data ?? [];
  const active = list.find(t => t.id === current);
  return <div className="flex flex-wrap items-center gap-2">
    <select aria-label="Chats" value={active ? current : ''} onChange={e => { if (e.target.value) onSelect(e.target.value); }}
      className="min-w-0 flex-1 rounded border bg-panel px-2 py-1">
      <option value="">{active ? '' : 'New chat'}</option>
      {list.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
    </select>
    <Button size="xs" variant="outline" onClick={() => { onSelect(crypto.randomUUID()); }}>New</Button>
    {active && editing === null && <>
      <Button size="xs" variant="ghost" onClick={() => { setEditing(active.id); setTitle(active.title); }}>Rename</Button>
      <Button size="xs" variant="ghost" disabled={remove.isPending} onClick={() => { remove.mutate(active.id); }}>Delete</Button>
    </>}
    {editing !== null && <form className="flex w-full gap-2" onSubmit={e => { e.preventDefault(); rename.mutate({ id: editing, title: title.trim() }); setEditing(null); }}>
      <input aria-label="Chat title" value={title} maxLength={120} onChange={e => { setTitle(e.target.value); }} className="min-w-0 flex-1 rounded border bg-panel px-2 py-1" />
      <Button size="xs" type="submit" disabled={title.trim() === ''}>Save</Button>
      <Button size="xs" variant="ghost" type="button" onClick={() => { setEditing(null); }}>Cancel</Button>
    </form>}
  </div>;
}

function Conversation({ threadId, model }: { threadId: string; model: string | null }) {
  const history = useQuery({ queryKey: ['agent', 'thread', threadId], retry: false,
    queryFn: ({ signal }) => apiFetch(`/v1/agent/threads/${threadId}`, { schema: messagesSchema, signal }).catch(() => []) });
  if (history.isPending) return <p className="text-muted-foreground">Loading chat…</p>;
  return <ChatBody threadId={threadId} initial={history.data as UIMessage[]} model={model} />;
}

function ChatBody({ threadId, initial, model }: { threadId: string; initial: UIMessage[]; model: string | null }) {
  const client = useQueryClient();
  // Only the new message travels; the server holds the history (no forged assistant or tool turns).
  const transport = useMemo(() => new DefaultChatTransport<UIMessage>({
    api: apiUrl('/v1/agent/chat'), credentials: 'include', headers: { ...API_HEADERS },
    prepareSendMessagesRequest: ({ id, messages }) => ({ body: { id, message: messages[messages.length - 1] } }),
  }), []);
  const chat = useChat({ id: threadId, messages: initial, transport,
    onFinish: () => { void client.invalidateQueries({ queryKey: ['agent', 'threads'] }); } });
  const [input, setInput] = useState('');
  const busy = chat.status === 'submitted' || chat.status === 'streaming';
  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    void chat.sendMessage({ text });
    setInput('');
  };
  return <>
    <ol aria-label="Messages" className="min-h-0 flex-1 space-y-3 overflow-auto">
      {chat.messages.length === 0 && <li className="text-muted-foreground">Ask about a symbol, your paper positions or a setup. The assistant reads data only and never places orders.</li>}
      {chat.messages.map(m => <li key={m.id} className={m.role === 'user' ? 'ml-6 rounded bg-muted/40 p-2' : 'mr-2'}>
        <span className="sr-only">{m.role === 'user' ? 'You' : 'Assistant'}: </span><MessageParts parts={m.parts} />
      </li>)}
      {chat.status === 'submitted' && <li className="text-muted-foreground">Thinking…</li>}
    </ol>
    {chat.error && <p role="alert" className="text-down">{errorText(chat.error)} <button type="button" className="underline" onClick={() => { chat.clearError(); void chat.regenerate(); }}>Retry</button></p>}
    <form onSubmit={submit} className="flex gap-2">
      <input aria-label="Message" value={input} onChange={e => { setInput(e.target.value); }} maxLength={4000} placeholder="Ask the assistant"
        className="min-w-0 flex-1 rounded border bg-panel px-2 py-1" />
      {busy ? <Button size="sm" type="button" variant="outline" onClick={() => { void chat.stop(); }}>Stop</Button>
        : <Button size="sm" type="submit" disabled={input.trim() === ''}>Send</Button>}
    </form>
    {model && <p className="text-xs text-muted-foreground">Model: {model}</p>}
  </>;
}

function errorText(error: Error): string {
  const message = error.message;
  if (/RATE_LIMITED|limit/i.test(message)) return 'Daily assistant limit reached; it resets at midnight IST.';
  if (/UNAVAILABLE|not configured/i.test(message)) return 'The assistant is unavailable right now.';
  return 'The assistant could not answer.';
}
