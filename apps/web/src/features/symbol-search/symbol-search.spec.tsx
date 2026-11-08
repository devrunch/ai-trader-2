import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { SymbolSearchDialog } from './index';
import { useOpenOnType } from './use-open-on-type';
import { useSymbolSearch } from './use-symbol-search';
import { recentSymbols } from './recent-symbols';

// FR-SY-6, FR-UI-6, FR-UI-7, FR-UI-9.
const instrument = { id: 'NSE:RELIANCE', description: 'Reliance Industries', exchange: 'NSE', type: 'stock', currency: 'INR', status: 'active' };
const requests: URL[] = [];
const server = setupServer(http.get('/api/v1/instruments/search', ({ request }) => {
  const url = new URL(request.url); requests.push(url);
  return HttpResponse.json({ query: url.searchParams.get('q'), results: [instrument] });
}));
beforeAll(() => { server.listen(); });
afterAll(() => { server.close(); });
afterEach(() => { cleanup(); server.resetHandlers(); requests.length = 0; vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });
function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function dialog(initial = '') {
  render(<SymbolSearchDialog initial={initial} onClose={vi.fn()} onSelect={vi.fn()} />, { wrapper: Wrapper });
}
it('typing a letter opens the dialog with that letter', () => {
  const open = vi.fn(); const hook = renderHook(() => { useOpenOnType(open); });
  fireEvent.keyDown(document.body, { key: 'r' }); expect(open).toHaveBeenCalledWith('r');
  hook.unmount(); fireEvent.keyDown(document.body, { key: '2' }); expect(open).toHaveBeenCalledTimes(1);
});
it('does not open while typing in an input', () => {
  const open = vi.fn(); renderHook(() => { useOpenOnType(open); });
  render(<><input aria-label="input" /><textarea aria-label="textarea" /><select aria-label="select" /><div contentEditable aria-label="editor"><span>editable</span></div></>);
  for (const label of ['input', 'textarea', 'select', 'editor']) fireEvent.keyDown(screen.getByLabelText(label), { key: 'a' });
  fireEvent.keyDown(screen.getByText('editable'), { key: 'b' }); expect(open).not.toHaveBeenCalled();
});
it('ignores keys with ctrl, meta or alt', () => {
  const open = vi.fn(); renderHook(() => { useOpenOnType(open); });
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) fireEvent.keyDown(document.body, { key: 'a', [modifier]: true });
  for (const key of ['Escape', ' ', '!']) fireEvent.keyDown(document.body, { key });
  expect(open).not.toHaveBeenCalled();
});
it('debounces and shows results', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const hook = renderHook(({ q }) => useSymbolSearch(q, {}), { wrapper: Wrapper, initialProps: { q: 'r' } });
  hook.rerender({ q: 're' }); await act(() => vi.advanceTimersByTimeAsync(50)); hook.rerender({ q: 'rel' });
  await act(() => vi.advanceTimersByTimeAsync(149)); expect(requests).toHaveLength(0);
  await act(() => vi.advanceTimersByTimeAsync(1));
  await act(() => vi.advanceTimersByTimeAsync(10)); vi.useRealTimers();
  await waitFor(() => { expect(hook.result.current.data?.results).toEqual([instrument]); });
  expect(requests).toHaveLength(1); expect(requests[0]?.searchParams.get('q')).toBe('rel');
  expect(requests[0]?.searchParams.get('limit')).toBe('20');
});
it('filters by exchange chip', async () => {
  dialog(); expect(screen.getByLabelText('Loading symbols').children).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: 'NSE' }));
  await waitFor(() => { expect(requests.at(-1)?.searchParams.get('exchange')).toBe('NSE'); });
  expect(await screen.findByText('Reliance Industries')).toBeDefined();
  fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'stock' } });
  await waitFor(() => { expect(requests.at(-1)?.searchParams.get('type')).toBe('stock'); });
});
it('shows empty and error states', async () => {
  server.use(http.get('/api/v1/instruments/search', () => HttpResponse.json({ query: 'xyz', results: [] })));
  dialog('xyz'); expect(await screen.findByText('No matches for "xyz"')).toBeDefined();
  cleanup(); server.use(http.get('/api/v1/instruments/search', () => HttpResponse.json({ code: 'UNAVAILABLE', message: 'Unavailable', requestId: 'search-test' }, { status: 503 })));
  dialog(); expect(await screen.findByText("Couldn't search right now")).toBeDefined(); expect(screen.getByText('UNAVAILABLE')).toBeDefined();
  server.resetHandlers(); fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Reliance Industries')).toBeDefined();
});
it('remembers recent symbols even when storage throws', () => {
  for (let i = 0; i < 12; i++) recentSymbols.push(`NSE:S${String(i)}`);
  recentSymbols.push('NSE:S5'); expect(recentSymbols.get()).toEqual(['NSE:S5', 'NSE:S11', 'NSE:S10', 'NSE:S9', 'NSE:S8', 'NSE:S7', 'NSE:S6', 'NSE:S4', 'NSE:S3', 'NSE:S2']);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => { recentSymbols.push('NSE:NIFTY'); }).not.toThrow(); expect(recentSymbols.get()).toEqual([]);
});
