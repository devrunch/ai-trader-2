import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { NotificationBell } from './index';

let reads = 0;
const server = setupServer(
  http.get('/api/v1/notifications', () => HttpResponse.json({ unread: reads ? 0 : 2, items: [
    { id: '00000000-0000-4000-8000-000000000001', kind: 'fill', title: 'Stop hit: sold 5 NSE:RELIANCE at 1,323.00', body: 'Realised P&L −52.00 (paper)', link: { symbol: 'NSE:RELIANCE' }, createdAt: '2026-11-11T05:00:00.000Z', read: false },
    { id: '00000000-0000-4000-8000-000000000002', kind: 'task', title: 'Task "NIFTY alert" ran', body: 'NIFTY crossed 25,346.90', link: { threadId: '00000000-0000-4000-8000-0000000000aa' }, createdAt: '2026-11-11T04:00:00.000Z', read: false },
  ] })),
  http.post('/api/v1/notifications/read', () => { reads++; return new HttpResponse(null, { status: 204 }); }),
);
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); reads = 0; });
afterAll(() => { server.close(); });

it('shows the unread count, marks all read on open, and opens a fill\'s chart', async () => {
  const onOpenSymbol = vi.fn();
  render(<Providers><NotificationBell onOpenSymbol={onOpenSymbol} /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
  await vi.waitFor(() => { expect(reads).toBe(1); });
  expect(screen.getByText('Realised P&L −52.00 (paper)')).toBeDefined();
  fireEvent.click(screen.getByText('Stop hit: sold 5 NSE:RELIANCE at 1,323.00'));
  expect(onOpenSymbol).toHaveBeenCalledWith('NSE:RELIANCE');
});

it('lets the user opt in to emailed reports and saves the choice', async () => {
  let saved: unknown = null;
  server.use(
    http.get('/api/v1/notifications/email', () => HttpResponse.json({ reports: saved !== null, address: 'me@example.com', available: true })),
    http.put('/api/v1/notifications/email', async ({ request }) => { saved = await request.json(); return HttpResponse.json({ reports: true, address: 'me@example.com', available: true }); }),
  );
  render(<Providers><NotificationBell onOpenSymbol={vi.fn()} /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
  const box = await screen.findByRole('checkbox', { name: 'Email me watch reports' });
  expect(screen.getByText(/Sent to me@example.com/)).toBeDefined();
  fireEvent.click(box);
  await vi.waitFor(() => { expect(saved).toEqual({ reports: true }); });
});
