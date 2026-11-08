import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, expect, it } from 'vitest';
import { Providers } from '../providers';
import { createAppRouter } from '../router';
// FR-UI-3, FR-UI-5: canonical symbol and interval survive navigation.
afterEach(cleanup);
async function visit(url: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [url] }));
  await router.load();
  render(<Providers><RouterProvider router={router} /></Providers>);
}
it('reads symbol and interval from the URL', async () => {
  await visit('/terminal?symbol=NSE:RELIANCE&interval=15');
  expect(await screen.findByText('NSE:RELIANCE')).toBeDefined();
  expect(screen.getByText('15')).toBeDefined();
});
it('falls back to defaults on invalid search', async () => {
  await visit('/terminal?symbol=bad&interval=7');
  expect(await screen.findByText('NSE:NIFTY')).toBeDefined();
  expect(screen.getByText('5')).toBeDefined();
});
