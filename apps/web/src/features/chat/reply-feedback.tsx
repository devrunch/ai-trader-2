import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { apiFetch } from '../../shared/api';

/** Thumbs under an assistant reply; the reply is the `turnIndex`-th answer of its thread. */
export function ReplyFeedback({ threadId, turnIndex }: { threadId: string; turnIndex: number }) {
  const [sent, setSent] = useState<'up' | 'down' | null>(null);
  const send = useMutation({ mutationFn: (value: 'up' | 'down') => apiFetch('/v1/agent/feedback', { schema: z.unknown(), method: 'POST', body: { threadId, turnIndex, value } }),
    onSuccess: (_d, value) => { setSent(value); } });
  return <div role="group" aria-label="Was this useful?" className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
    {(['up', 'down'] as const).map(value => <button key={value} type="button" aria-pressed={sent === value} disabled={send.isPending || sent !== null}
      aria-label={value === 'up' ? 'Useful' : 'Not useful'} onClick={() => { send.mutate(value); }}
      className={`rounded border px-1.5 py-0.5 hover:bg-muted ${sent === value ? 'bg-muted text-foreground' : ''}`}>{value === 'up' ? '👍' : '👎'}</button>)}
    {send.isError && <span role="alert" className="text-down">Not saved</span>}
  </div>;
}
