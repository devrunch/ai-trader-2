import { fetch } from 'undici';
import { generate } from 'otplib';
import { KiteConnect } from 'kiteconnect';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { KiteCredentials } from './kite-credentials';
import { sanitizeFailureMessage } from './kite-failure';

export type KiteLoginStage = 'login' | 'twofa' | 'redirect' | 'session';
export class KiteLoginError extends Error {
  constructor(readonly stage: KiteLoginStage, message: string, readonly captcha = false, readonly httpStatus?: number) { super(message); this.name = 'KiteLoginError'; }
}
export interface KiteHttp {
  request(url: string, init: { method: 'GET' | 'POST'; form?: Record<string, string>; signal: AbortSignal }): Promise<{
    status: number; headers: Headers; json(): Promise<unknown>; url: string;
  }>;
}
export interface KiteTokenExchange {
  generateSession(requestToken: string, apiSecret: string): Promise<{ access_token: string; user_id: string; user_name?: string }>;
  invalidateAccessToken?(accessToken: string): Promise<boolean>;
}

export function createKiteHttp(): KiteHttp {
  const cookies = new Map<string, Map<string, string>>();
  return { request: (url, init) => withTimeout(async (signal) => {
    const host = new URL(url).host;
    const jar = cookies.get(host) ?? new Map<string, string>();
    const response = await fetch(url, {
      method: init.method, redirect: 'manual', signal,
      headers: { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(init.form ? { body: new URLSearchParams(init.form) } : {}),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0] ?? '';
      const separator = pair.indexOf('=');
      if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    cookies.set(host, jar);
    // Consume the body within the same deadline, including redirects without JSON.
    const body = await response.text();
    return { status: response.status, headers: new Headers([...response.headers]), url: response.url,
      json: () => { const value: unknown = JSON.parse(body); return Promise.resolve(value); } };
  }, 15000, init.signal) };
}

const loginReply = z.object({ error_type: z.string().optional(), message: z.string().optional(), data: z.unknown().optional() });
const loginData = z.object({ request_id: z.string().min(1), captcha: z.unknown().optional() });
function transportReason(error: unknown): string {
  const source: unknown = error instanceof Error && error.cause !== undefined ? error.cause : error;
  const code = typeof source === 'object' && source !== null && 'code' in source ? source.code : undefined;
  return typeof code === 'string' ? code : error instanceof Error ? error.name : 'unknown error';
}
async function replyMessage(response: { json(): Promise<unknown> }): Promise<string> {
  try {
    const parsed = loginReply.safeParse(await response.json());
    return parsed.success && parsed.data.message ? parsed.data.message : 'no message';
  } catch { return 'non-JSON body'; }
}
async function stage<T>(name: KiteLoginStage, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof KiteLoginError) throw error;
    throw new KiteLoginError(name, `${name} failed: ${transportReason(error)}`);
  }
}
export async function loginToKite(
  creds: KiteCredentials, http: KiteHttp, signal: AbortSignal, now: () => number = Date.now,
): Promise<{ requestToken: string }> {
  const clean = (text: string) => sanitizeFailureMessage(text, Object.values(creds));
  const requestId = await stage('login', async () => {
    const response = await http.request('https://kite.zerodha.com/api/login', {
      method: 'POST', signal, form: { user_id: creds.userId, password: creds.password },
    });
    let raw: unknown;
    try { raw = await response.json(); }
    catch { throw new KiteLoginError('login', `login failed: non-JSON body (HTTP ${String(response.status)})`, false, response.status); }
    const reply = loginReply.safeParse(raw);
    const data = reply.success ? loginData.safeParse(reply.data.data) : undefined;
    const captchaReply = reply.success && ((typeof reply.data.data === 'object' && reply.data.data !== null && 'captcha' in reply.data.data) ||
      (reply.data.error_type === 'InputException' && /captcha/i.test(reply.data.message ?? '')));
    if (captchaReply) throw new KiteLoginError('login', 'captcha required', true);
    if (response.status !== 200 || !data?.success) {
      const detail = reply.success && reply.data.message ? reply.data.message : 'no request_id';
      throw new KiteLoginError('login', `login failed: HTTP ${String(response.status)} ${clean(detail)}`, false, response.status);
    }
    return data.data.request_id;
  });
  await stage('twofa', async () => {
    const response = await http.request('https://kite.zerodha.com/api/twofa', {
      method: 'POST', signal, form: { user_id: creds.userId, request_id: requestId,
        twofa_value: await generate({ secret: creds.totpSecret, epoch: now() / 1000 }), twofa_type: 'totp' },
    });
    if (response.status !== 200) throw new KiteLoginError('twofa', `twofa failed: HTTP ${String(response.status)} ${clean(await replyMessage(response))}`, false, response.status);
  });
  return stage('redirect', () => walkRedirects(creds.apiKey, http, signal));
}
async function walkRedirects(apiKey: string, http: KiteHttp, signal: AbortSignal): Promise<{ requestToken: string }> {
  let url = `https://kite.zerodha.com/connect/login?api_key=${encodeURIComponent(apiKey)}&v=3`;
  let last = 'no response';
  for (let hop = 0; hop < 10; hop++) {
    const response = await http.request(url, { method: 'GET', signal });
    const location = response.headers.get('Location');
    last = `HTTP ${String(response.status)} at ${new URL(response.url || url).pathname}`;
    for (const candidate of [location, response.url]) {
      if (!candidate) continue;
      const requestToken = new URL(candidate, url).searchParams.get('request_token');
      if (requestToken) return { requestToken };
    }
    if (!location || response.status < 300 || response.status >= 400) break;
    url = new URL(location, url).toString();
  }
  throw new KiteLoginError('redirect', `no request_token, last ${last}`);
}

async function sessionStage<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    const fields = typeof error === 'object' && error !== null ? error as { error_type?: unknown; message?: unknown; status?: unknown } : {};
    const kind = typeof fields.error_type === 'string' ? fields.error_type : transportReason(error);
    const detail = typeof fields.message === 'string' ? ` ${fields.message}` : '';
    throw new KiteLoginError('session', `session failed: ${kind}${detail}`, false, typeof fields.status === 'number' ? fields.status : undefined);
  }
}
const sessionResponse = z.object({ access_token: z.string().min(1), user_id: z.string().min(1), user_name: z.string().optional() });
export function createKiteTokenExchange(apiKey: string, signal: AbortSignal): KiteTokenExchange {
  const client = new KiteConnect({ api_key: apiKey, timeout: 15000, debug: false });
  return {
    generateSession: (requestToken, apiSecret) => sessionStage(() => withTimeout(async () => {
      const session = sessionResponse.parse(await client.generateSession(requestToken, apiSecret));
      return { access_token: session.access_token, user_id: session.user_id,
        ...(session.user_name === undefined ? {} : { user_name: session.user_name }) };
    }, 15000, signal)),
    invalidateAccessToken: accessToken => withTimeout(() => client.invalidateAccessToken(accessToken), 15000, signal),
  };
}
