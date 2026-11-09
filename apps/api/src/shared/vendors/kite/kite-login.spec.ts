import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetch, Response } from 'undici';
import { generate } from 'otplib';
import { createKiteHttp, KiteLoginError, loginToKite, type KiteHttp } from './kite-login';

const creds = { apiKey: 'api-key', apiSecret: 'api-secret', userId: 'user', password: 'password-secret', totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' };
const now = () => Date.parse('2026-11-08T00:29:00Z');
const signal = new AbortController().signal;
function response(status = 200, body: unknown = {}, location?: string, url = 'https://kite.zerodha.com/') {
  return { status, headers: new Headers(location ? { Location: location } : {}), json: () => Promise.resolve(body), url };
}
function script(responses: ReturnType<typeof response>[]) {
  const request = vi.fn<KiteHttp['request']>();
  for (const value of responses) request.mockResolvedValueOnce(value);
  return { request };
}
const authenticated = () => [response(200, { data: { request_id: 'request-id' } }), response()];
// FR-MD-3, E3, NFR-SC-1: deterministic scripted login, with no vendor network.
describe('Kite login', () => {
  it('logs in through login, twofa and redirect', async () => {
    const http = script([...authenticated(), response(302, {}, 'https://registered.invalid/?request_token=token&action=login')]);
    await expect(loginToKite(creds, http, signal, now)).resolves.toEqual({ requestToken: 'token' });
    expect(http.request.mock.calls[0]).toEqual(['https://kite.zerodha.com/api/login', { method: 'POST', signal, form: { user_id: 'user', password: creds.password } }]);
    expect(http.request.mock.calls[1]).toEqual(['https://kite.zerodha.com/api/twofa', { method: 'POST', signal, form: { user_id: 'user', request_id: 'request-id', twofa_type: 'totp', twofa_value: await generate({ secret: creds.totpSecret, epoch: now() / 1000 }) } }]);
    expect(http.request).toHaveBeenCalledTimes(3);
  });
  it('extracts request_token from a Location header mid-chain', async () => {
    const http = script([...authenticated(), response(302, {}, '/next'), response(302, {}, 'https://registered.invalid/?request_token=middle&x=y')]);
    await expect(loginToKite(creds, http, signal, now)).resolves.toEqual({ requestToken: 'middle' });
    expect(http.request).toHaveBeenCalledTimes(4);
  });
  it('extracts request_token from the final response URL', async () => {
    const http = script([...authenticated(), response(200, {}, undefined, 'https://kite.zerodha.com/?request_token=final&x=y')]);
    await expect(loginToKite(creds, http, signal, now)).resolves.toEqual({ requestToken: 'final' });
  });
  it('fails at the login stage when request_id is missing', async () => {
    await expect(loginToKite(creds, script([response()]), signal, now)).rejects.toMatchObject({ stage: 'login' });
  });
  it('detects a captcha response and marks it for a 24 hour auto-login block', async () => {
    const http = script([response(400, { error_type: 'InputException', message: 'Invalid CAPTCHA values.', data: { captcha: 'required' } })]);
    const error: unknown = await loginToKite(creds, http, signal, now).catch((value: unknown) => value);
    expect(error).toMatchObject({ stage: 'login', message: 'captcha required', captcha: true });
    expect(http.request).toHaveBeenCalledTimes(1);
  });
  it('fails at the twofa stage with a typed error and no secrets in the message', async () => {
    const http = script([response(200, { data: { request_id: 'request-id' } }), response(403, { message: Object.values(creds).join(' ') })]);
    const error: unknown = await loginToKite(creds, http, signal, now).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(KiteLoginError);
    expect(error).toMatchObject({ stage: 'twofa' });
    for (const secret of Object.values(creds)) expect(String(error)).not.toContain(secret);
  });
  it('stops after 10 redirect hops without a token', async () => {
    const http = script([...authenticated(), ...Array.from({ length: 10 }, () => response(302, {}, '/next'))]);
    await expect(loginToKite(creds, http, signal, now)).rejects.toMatchObject({ stage: 'redirect', message: 'no request_token' });
    expect(http.request).toHaveBeenCalledTimes(12);
  });
});

vi.mock('undici', async (importOriginal) => {
  const original = await importOriginal<typeof import('undici')>();
  return { ...original, fetch: vi.fn() };
});
// E3, NFR-SC-1: host-scoped cookies and bounded HTTP calls.
describe('Kite HTTP adapter', () => {
  afterEach(() => { vi.useRealTimers(); vi.mocked(fetch).mockReset(); });
  it('returns host cookies and disables automatic redirects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { headers: { 'Set-Cookie': 'session=secret; Path=/; HttpOnly' } }))
      .mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('{}'));
    const http = createKiteHttp();
    await http.request('https://kite.zerodha.com/api/login', { method: 'POST', signal, form: { user_id: 'user' } });
    await http.request('https://kite.zerodha.com/api/twofa', { method: 'POST', signal });
    await http.request('https://other.invalid/', { method: 'GET', signal });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual', method: 'POST', body: new URLSearchParams({ user_id: 'user' }) });
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.headers).toEqual({ Cookie: 'session=secret' });
    expect(vi.mocked(fetch).mock.calls[2]?.[1]?.headers).toEqual({ Cookie: '' });
  });
  it('aborts the HTTP call after 15 seconds', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_url, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise(() => {});
    });
    const pending = createKiteHttp().request('https://kite.zerodha.com/', { method: 'GET', signal });
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    expect(requestSignal?.aborted).toBe(true);
  });
});
