import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Providers } from '../../app/providers';
import { rootRoute } from '../../app/routes/root-route';
import { LoginPage, RequireRole } from './index';

afterEach(cleanup);
it('login page submits and redirects', async () => {
  const server = setupServer(http.post('/api/v1/auth/login', () => HttpResponse.json({ user: { id: '00000000-0000-4000-8000-000000000001', username: 'admin', role: 'admin' } })));
  server.listen();
  try {
    const route = createRoute({ getParentRoute: () => rootRoute, path: '/login', validateSearch: (s: Record<string, unknown>) => ({ redirect: typeof s.redirect === 'string' ? s.redirect : '/' }), component: LoginPage });
    const terminal = createRoute({ getParentRoute: () => rootRoute, path: '/terminal', component: () => <p>Terminal page</p> });
    const router = createRouter({ routeTree: rootRoute.addChildren([route, terminal]), history: createMemoryHistory({ initialEntries: ['/login?redirect=%2Fterminal'] }) });
    await router.load(); render(<Providers><RouterProvider router={router} /></Providers>);
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'valid-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Terminal page')).toBeDefined();
  } finally { server.close(); }
});

it('login page shows an error for bad credentials', async () => {
  const server = setupServer(http.post('/api/v1/auth/login', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })));
  server.listen();
  try {
    const route = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
    const router = createRouter({ routeTree: rootRoute.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/login'] }) });
    await router.load(); render(<Providers><RouterProvider router={router} /></Providers>);
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid username or password');
  } finally { server.close(); }
});

it('RequireRole redirects anonymous users to /login', async () => {
  const server = setupServer(http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHORIZED', message: 'Authentication required', requestId: 'test' }, { status: 401 })));
  server.listen();
  try {
    const protectedRoute = createRoute({ getParentRoute: () => rootRoute, path: '/protected', component: () => <RequireRole role="admin"><p>Admin panel</p></RequireRole> });
    const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: () => <p>Login route</p> });
    const router = createRouter({ routeTree: rootRoute.addChildren([protectedRoute, loginRoute]), history: createMemoryHistory({ initialEntries: ['/protected'] }) });
    await router.load(); render(<Providers><RouterProvider router={router} /></Providers>);
    expect(await screen.findByText('Login route')).toBeDefined();
  } finally { server.close(); }
});
