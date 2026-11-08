import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ERROR_CODES } from '@aitrader/contracts';
import { apiFetch, ApiError, isRetryable } from './index';
// SRD §10.3; FR-UI-6: typed failure outcomes.
afterEach(() => vi.unstubAllGlobals());
const schema = z.object({ value: z.number() });
const request = () => apiFetch('/test', { schema });
it('apiFetch parses success with schema', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ value: 3 })));
  expect(await request()).toEqual({ value: 3 });
});
it('apiFetch throws ApiError with server code and requestId', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'NOT_FOUND', message: 'x', requestId: 'r1' }, { status: 404 })));
  await expect(request()).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'x', requestId: 'r1', status: 404 });
});
it('apiFetch maps a non-contract error body by status', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html/>', { status: 503 })));
  await expect(request()).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 });
});
it('apiFetch maps network failure to UNAVAILABLE', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  await expect(request()).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 0 });
});
it('apiFetch rejects a success body that fails the schema', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ value: 'bad' })));
  await expect(request()).rejects.toMatchObject({ code: 'INTERNAL', message: 'Unexpected response shape' });
});
it('apiFetch rethrows aborts unwrapped', async () => {
  const abort = new DOMException('aborted', 'AbortError');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
  await expect(request()).rejects.toBe(abort);
});
it('isRetryable is true only for UNAVAILABLE and PROVIDER_DOWN', () => {
  for (const code of ERROR_CODES) expect(isRetryable(new ApiError(code, 'x', 503))).toBe(['UNAVAILABLE', 'PROVIDER_DOWN'].includes(code));
  expect(isRetryable(new Error('x'))).toBe(false);
});
