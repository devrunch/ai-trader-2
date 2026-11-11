import { Sha256 } from '@aws-crypto/sha256-js';
import { SignatureV4 } from '@smithy/signature-v4';

export interface AwsKeys { accessKeyId: string; secretAccessKey: string; sessionToken?: string | undefined }

/** `https://<id>.lambda-url.<region>.on.aws/`: the region a Lambda Function URL lives in, or null for any other host. */
export function lambdaUrlRegion(url: string): string | null {
  return /\.lambda-url\.([a-z0-9-]+)\.on\.aws$/.exec(new URL(url).hostname)?.[1] ?? null;
}

/** A fetch that signs each request for an IAM-authenticated Lambda Function URL (service `lambda`). */
export function sigv4Fetch(region: string, keys: AwsKeys, base: typeof fetch = fetch): typeof fetch {
  const signer = new SignatureV4({ service: 'lambda', region, sha256: Sha256,
    credentials: { accessKeyId: keys.accessKeyId, secretAccessKey: keys.secretAccessKey, ...(keys.sessionToken ? { sessionToken: keys.sessionToken } : {}) } });
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const body = typeof init.body === 'string' ? init.body : undefined;
    const headers: Record<string, string> = { host: url.host };
    new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
    const signed = await signer.sign({ method: init.method ?? 'GET', protocol: url.protocol, hostname: url.hostname, path: url.pathname,
      query: Object.fromEntries(url.searchParams), headers, ...(body === undefined ? {} : { body }) });
    const out = new Headers();
    for (const [key, value] of Object.entries(signed.headers)) if (key !== 'host') out.set(key, value);
    return base(url, { ...init, headers: out });
  };
}
