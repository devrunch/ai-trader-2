import { PINE_SCRIPT_LIMITS } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';
import { readCappedBody } from '../../../shared/sources';

export const PINE_FETCH_LIMITS = { timeoutMs: 5000, maxBytes: 200 * 1024, maxRedirects: 3 } as const;

const privateHost = (host: string): boolean =>
  host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':');

function checkUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || privateHost(url.hostname)) throw new ValidationError('Only public https links to plain-text Pine are followed');
  return url;
}

const readCapped = (response: Response): Promise<string> =>
  readCappedBody(response, PINE_FETCH_LIMITS.maxBytes, () => new ValidationError('That link is larger than 200 KB'));

/** Fetches a raw Pine source from a link: https only, plain text, 5 s, 200 KB, redirects re-checked. The text is only ever data. */
export async function fetchPineSource(link: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const abort = new AbortController();
  const timer = setTimeout(() => { abort.abort(); }, PINE_FETCH_LIMITS.timeoutMs);
  try { return await follow(link, fetchFn, abort.signal); } finally { clearTimeout(timer); }
}

async function follow(link: string, fetchFn: typeof fetch, signal: AbortSignal): Promise<string> {
  let url = checkUrl(link);
  for (let hop = 0; hop <= PINE_FETCH_LIMITS.maxRedirects; hop++) {
    let response: Response;
    try { response = await fetchFn(url, { redirect: 'manual', signal, headers: { accept: 'text/plain' } }); }
    catch { throw new ValidationError('The link could not be fetched in time'); }
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) { url = checkUrl(new URL(location, url).toString()); continue; }
    if (!response.ok) throw new ValidationError(`The link answered ${String(response.status)}`);
    if (!(response.headers.get('content-type') ?? '').toLowerCase().startsWith('text/plain')) throw new ValidationError('The link is not plain text; use a raw source link');
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > PINE_FETCH_LIMITS.maxBytes) throw new ValidationError('That link is larger than 200 KB');
    const text = await readCapped(response).catch((error: unknown) => { throw error instanceof ValidationError ? error : new ValidationError('The link could not be read in time'); });
    if (!text.trim()) throw new ValidationError('The link is empty');
    if (text.length > PINE_SCRIPT_LIMITS.sourceChars) throw new ValidationError('That script is longer than 100,000 characters');
    return text;
  }
  throw new ValidationError('The link redirected too many times');
}
