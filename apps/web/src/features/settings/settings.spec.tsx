import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Providers } from '../../app/providers';
import { SettingsPage } from './settings-page';

let saved: unknown = null;
let allowed = true;
const server = setupServer(
  http.get('/api/v1/agent/prefs', () => HttpResponse.json({ mode: allowed ? 'act' : 'ask', maxRiskPct: 0.5, maxTradesPerDay: 3, allowed })),
  http.put('/api/v1/agent/prefs', async ({ request }) => { saved = await request.json(); return HttpResponse.json({ ...(saved as object), allowed: true }); }),
  http.get('/api/v1/agent/knowledge', () => HttpResponse.json({ profile: {}, notes: [], learned: [] })),
  http.get('/api/v1/notifications/email', () => HttpResponse.json({ reports: false, address: null, available: true })),
);
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); saved = null; allowed = true; });
afterAll(() => { server.close(); });

it('shows the assistant trading on paper by itself by default and saves a switch to ask first with new limits', async () => {
  render(<Providers><SettingsPage /></Providers>);
  const act = await screen.findByRole('radio', { name: /Trade on paper by itself/ });
  expect((act as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: /Ask me first/ }));
  fireEvent.change(screen.getByLabelText(/Trades per day/), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => { expect(saved).toEqual({ mode: 'ask', maxRiskPct: 0.5, maxTradesPerDay: 5 }); });
});

it('says so when an admin has switched trading by the assistant off', async () => {
  allowed = false;
  render(<Providers><SettingsPage /></Providers>);
  expect(await screen.findByText(/An admin has switched off trading by the assistant/)).toBeDefined();
});
