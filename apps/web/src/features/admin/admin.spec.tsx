import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { rootRoute } from '../../app/routes/root-route';
import { AdminPage, ZerodhaCallbackPage } from './index';

const admin = { user: { id: '00000000-0000-4000-8000-000000000001', username: 'owner', role: 'admin' } };
const zerodha = (overrides: object = {}) => ({ connected: false, autoLogin: { enabled: true, attemptsToday: 2, cap: 6 },
  loginUrl: 'https://kite.zerodha.com/connect/login?v=3&api_key=key', redirectUrl: 'http://localhost:5173/admin/zerodha/callback', ...overrides });
const feeds = (state = 'live') => ({ leader: { instanceId: 'md-1', ttlMs: 9000 },
  vendors: [{ vendor: 'kite', state, at: 1 }, { vendor: 'deriv', state: 'stale', reason: 'PROVIDER_DOWN', at: 1 }, { vendor: 'us-delayed', state: 'reconnecting', at: 1 }],
  subscriptions: [{ instrumentId: 'NSE:RELIANCE', count: 2 }] });
const jobs = [{ name: 'instruments-refresh', cron: '0 7 * * *', tz: 'Asia/Kolkata', lastRun: { at: '2026-11-09T01:30:00.000Z', outcome: 'ok' }, next: '2026-11-10T01:30:00.000Z' }];
const instruments = { sources: [{ source: 'kite', status: 'ok', count: 90000, lastSuccessAt: '2026-11-09T01:31:00.000Z' }], total: 90000 };

let zerodhaBody: object = zerodha();
let feedCalls = 0;
const server = setupServer(
  http.get('/api/v1/auth/me', () => HttpResponse.json(admin)),
  http.get('/api/v1/admin/zerodha', () => HttpResponse.json(zerodhaBody)),
  http.get('/api/v1/admin/ops/feeds', () => { feedCalls++; return HttpResponse.json(feeds()); }),
  http.get('/api/v1/admin/ops/jobs', () => HttpResponse.json(jobs)),
  http.get('/api/v1/admin/ops/instruments', () => HttpResponse.json(instruments)),
);
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); zerodhaBody = zerodha(); feedCalls = 0; vi.useRealTimers(); });
afterAll(() => { server.close(); });

async function renderAt(path: string) {
  const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin', validateSearch: (s: Record<string, unknown>) => ({ tab: typeof s.tab === 'string' ? s.tab : undefined, notice: typeof s.notice === 'string' ? s.notice : undefined }), component: AdminPage });
  const callback = createRoute({ getParentRoute: () => rootRoute, path: '/admin/zerodha/callback', component: ZerodhaCallbackPage });
  const login = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: () => <p>Login route</p> });
  const router = createRouter({ routeTree: rootRoute.addChildren([adminRoute, callback, login]), history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  render(<Providers><RouterProvider router={router} /></Providers>);
  return router;
}

it('admin routes redirect anonymous users to login', async () => {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHORIZED', message: 'Authentication required', requestId: 't' }, { status: 401 })));
  await renderAt('/admin');
  expect(await screen.findByText('Login route')).toBeDefined();
});

it('zerodha card shows blocked reason and disables auto-login', async () => {
  zerodhaBody = zerodha({ autoLogin: { enabled: true, attemptsToday: 3, cap: 6, blockedUntil: '2026-11-10T04:00:00.000Z', reason: 'CAPTCHA_REQUIRED' } });
  await renderAt('/admin');
  expect(await screen.findByText(/CAPTCHA/, {}, { timeout: 5000 })).toBeDefined(); // the admin route loads lazily
  expect(screen.getByText('3 / 6 today')).toBeDefined();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Try auto-login' }).disabled).toBe(true);
});

it('paste token submits and refreshes status', async () => {
  let posted: unknown;
  server.use(http.post('/api/v1/admin/zerodha/token', async ({ request }) => {
    posted = await request.json(); zerodhaBody = zerodha({ connected: true, expiresAt: '2026-11-10T00:30:00.000Z' });
    return HttpResponse.json({ connected: true, expiresAt: '2026-11-10T00:30:00.000Z' }, { status: 201 });
  }));
  await renderAt('/admin');
  fireEvent.click(await screen.findByRole('button', { name: 'Paste request token' }));
  fireEvent.change(screen.getByLabelText('Request token'), { target: { value: 'Token1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(await screen.findByText(/Connected until/)).toBeDefined();
  expect(posted).toEqual({ requestToken: 'Token1234' });
});

it('callback page posts the token, strips it from the URL and toasts the result', async () => {
  let posted: unknown;
  server.use(http.post('/api/v1/admin/zerodha/token', async ({ request }) => { posted = await request.json(); return HttpResponse.json({ connected: true, expiresAt: '2026-11-10T00:30:00.000Z' }, { status: 201 }); }));
  const router = await renderAt('/admin/zerodha/callback?request_token=Token5678&status=success');
  expect(await screen.findByText('Zerodha connected.')).toBeDefined();
  expect(posted).toEqual({ requestToken: 'Token5678' });
  expect(router.state.location.pathname).toBe('/admin');
  expect(router.state.location.href).not.toContain('Token5678');
});

it('callback page shows account mismatch', async () => {
  server.use(http.post('/api/v1/admin/zerodha/token', () => HttpResponse.json({ code: 'VALIDATION_FAILED', message: 'Zerodha account mismatch', requestId: 't', details: { reason: 'ACCOUNT_MISMATCH' } }, { status: 400 })));
  await renderAt('/admin/zerodha/callback?request_token=Token9999&status=success');
  expect(await screen.findByText(/different Zerodha account/)).toBeDefined();
});

it('feeds badges reflect states and auto-refresh pauses when hidden', async () => {
  await renderAt('/admin?tab=feeds');
  expect(await screen.findByText('md-1')).toBeDefined();
  expect(screen.getByText('live').getAttribute('data-tone')).toBe('up');
  expect(screen.getByText('stale').getAttribute('data-tone')).toBe('down');
  expect(screen.getByText('reconnecting').getAttribute('data-tone')).toBe('warning');
  expect(screen.getByText('NSE:RELIANCE')).toBeDefined();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const before = feedCalls;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await new Promise(resolve => setTimeout(resolve, 5500)); });
  expect(feedCalls).toBe(before);
  visibility.mockRestore();
}, 15_000);

it('run now shows pending then refreshes', async () => {
  let release: (() => void) | undefined;
  server.use(http.post('/api/v1/admin/ops/jobs/instruments-refresh/run', async () => { await new Promise<void>(resolve => { release = resolve; }); return new HttpResponse(null, { status: 202 }); }));
  await renderAt('/admin?tab=jobs');
  fireEvent.click(await screen.findByRole('button', { name: 'Run instruments-refresh now' }));
  expect(await screen.findByText('Running…')).toBeDefined();
  release?.();
  await waitFor(() => { expect(screen.queryByText('Running…')).toBeNull(); });
});

it('alerts tab says when mail is not configured and sends a test email when it is', async () => {
  server.use(http.get('/api/v1/admin/alerts', () => HttpResponse.json({ configured: false, recipients: [] })));
  await renderAt('/admin?tab=alerts');
  expect(await screen.findByText(/Mail is not configured/)).toBeDefined();
  cleanup();
  let sent = 0;
  server.use(
    http.get('/api/v1/admin/alerts', () => HttpResponse.json({ configured: true, recipients: ['ow***@example.com'] })),
    http.post('/api/v1/admin/alerts/test', () => { sent++; return HttpResponse.json({ result: 'sent' }, { status: 201 }); }),
  );
  await renderAt('/admin?tab=alerts');
  expect(await screen.findByText('ow***@example.com')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Send test email' }));
  expect(await screen.findByText('Test email sent.')).toBeDefined();
  expect(sent).toBe(1);
});

it('prompts tab edits like commits: save with a message, diff a version, revert', async () => {
  const history = [{ key: 'system', version: 1, content: 'Edited.', parentVersion: 0, message: 'first edit', author: 'owner', createdAt: '2026-11-10T00:00:00.000Z' }];
  const posts: Array<{ path: string; body: unknown }> = [];
  server.use(
    http.get('/api/v1/admin/prompts', () => HttpResponse.json([{ key: 'system', version: 2, source: 'admin' }])),
    http.get('/api/v1/admin/prompts/system', () => HttpResponse.json({ active: { key: 'system', version: 2, source: 'admin', content: 'Edited twice.' },
      history: [{ ...history[0], version: 2, content: 'Edited twice.', parentVersion: 1, message: 'second edit' }, ...history] })),
    http.get('/api/v1/admin/prompts/system/diff', () => HttpResponse.json([{ op: '-', line: 'Edited.' }, { op: '+', line: 'Edited twice.' }])),
    http.post('/api/v1/admin/prompts/system', async ({ request }) => { posts.push({ path: 'save', body: await request.json() }); return HttpResponse.json({ version: null }); }),
    http.post('/api/v1/admin/prompts/system/revert', async ({ request }) => { posts.push({ path: 'revert', body: await request.json() }); return HttpResponse.json({ version: null }); }),
  );
  await renderAt('/admin?tab=prompts');
  const editor = await screen.findByLabelText('Prompt content');
  fireEvent.change(editor, { target: { value: 'Edited three times.' } });
  fireEvent.change(screen.getByLabelText('Change message'), { target: { value: 'third edit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save version' }));
  await vi.waitFor(() => { expect(posts[0]).toEqual({ path: 'save', body: { content: 'Edited three times.', message: 'third edit' } }); });
  fireEvent.click(screen.getByRole('button', { name: 'Diff v1 → active' }));
  expect(await screen.findByText('+ Edited twice.')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Revert to v1' }));
  await vi.waitFor(() => { expect(posts[1]).toEqual({ path: 'revert', body: { version: 1 } }); });
});
