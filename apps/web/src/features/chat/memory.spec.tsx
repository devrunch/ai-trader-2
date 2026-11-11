import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Providers } from '../../app/providers';
import { MemoryList } from './memory-list';

let notes = [{ id: '00000000-0000-4000-8000-000000000001', note: 'Risks 1% per trade', createdAt: '2026-11-11T05:00:00.000Z' }];
const server = setupServer(
  http.get('/api/v1/agent/memory', () => HttpResponse.json({ notes })),
  http.delete('/api/v1/agent/memory/:id', ({ params }) => { notes = notes.filter(n => n.id !== params.id); return new HttpResponse(null, { status: 204 }); }),
);
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

it('shows what the assistant remembers and forgets a note on request', async () => {
  render(<Providers><MemoryList /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: 'Forget: Risks 1% per trade' }));
  expect(await screen.findByText(/Nothing remembered yet/)).toBeDefined();
  await waitFor(() => { expect(notes).toEqual([]); });
});
