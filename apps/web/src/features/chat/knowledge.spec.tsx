import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Providers } from '../../app/providers';
import { Knowledge } from './knowledge';
import { ReplyFeedback } from './reply-feedback';

const id = '00000000-0000-4000-8000-000000000002';
let learned = [{ id, kind: 'thumb-up', topic: 'screening', tools: ['scanUniverse'], createdAt: '2026-11-11T05:00:00.000Z' }];
let saved: unknown = null;
let feedback: unknown = null;
const server = setupServer(
  http.get('/api/v1/agent/knowledge', () => HttpResponse.json({ profile: { length: 'short' }, notes: [], learned, summary: '- screening: 1 accepted, 0 rejected' })),
  http.get('/api/v1/agent/memory', () => HttpResponse.json({ notes: [] })),
  http.put('/api/v1/agent/profile', async ({ request }) => { saved = await request.json(); return HttpResponse.json({}); }),
  http.delete('/api/v1/agent/learned/:id', ({ params }) => { learned = learned.filter(l => l.id !== params.id); return new HttpResponse(null, { status: 204 }); }),
  http.post('/api/v1/agent/feedback', async ({ request }) => { feedback = await request.json(); return new HttpResponse(null, { status: 204 }); }),
);
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

it('shows the profile, saves an edit and deletes a learned item', async () => {
  render(<Providers><Knowledge /></Providers>);
  fireEvent.change(await screen.findByLabelText('Instruments'), { target: { value: 'BANKNIFTY options' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => { expect(saved).toEqual({ markets: [], instruments: ['BANKNIFTY options'], timeframes: [], length: 'short' }); });
  fireEvent.click(await screen.findByRole('button', { name: 'Forget: thumb-up screening' }));
  await waitFor(() => { expect(learned).toEqual([]); });
});

it('sends a thumbs mark for the reply once', async () => {
  const thread = '00000000-0000-4000-8000-000000000009';
  render(<Providers><ReplyFeedback threadId={thread} turnIndex={2} /></Providers>);
  fireEvent.click(screen.getByRole('button', { name: 'Useful' }));
  await waitFor(() => { expect(feedback).toEqual({ threadId: thread, turnIndex: 2, value: 'up' }); });
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Not useful' })).toHaveProperty('disabled', true); });
});
