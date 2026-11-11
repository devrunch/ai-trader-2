import { describe, expect, it, vi } from 'vitest';
import { lambdaUrlRegion, sigv4Fetch } from './sigv4-fetch';

describe('Lambda Function URL signing', () => {
  it('finds the region of a Function URL and nothing for other hosts', () => {
    expect(lambdaUrlRegion('https://abc123.lambda-url.ap-south-1.on.aws/')).toBe('ap-south-1');
    expect(lambdaUrlRegion('http://127.0.0.1:8100')).toBeNull();
  });

  it('signs with SigV4 for the lambda service, keeping the body and content type', async () => {
    const base = vi.fn((_url: URL, _init: RequestInit) => Promise.resolve(new Response('{}')));
    const signed = sigv4Fetch('ap-south-1', { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' }, base as unknown as typeof fetch);
    await signed('https://abc.lambda-url.ap-south-1.on.aws/compute/v1/backtest', { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } });
    const [url, init] = base.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe('https://abc.lambda-url.ap-south-1.on.aws/compute/v1/backtest');
    expect(headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/ap-south-1\/lambda\/aws4_request, SignedHeaders=.*content-type.*host/);
    expect(headers.get('x-amz-content-sha256') ?? headers.get('x-amz-date')).toBeTruthy();
    expect(init?.body).toBe('{"a":1}');
  });
});
