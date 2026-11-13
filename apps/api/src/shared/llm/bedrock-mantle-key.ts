import { Sha256 } from '@aws-crypto/sha256-js';
import { SignatureV4 } from '@smithy/signature-v4';

export interface AwsCredentials { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string }

/**
 * A Bedrock Mantle bearer key from IAM credentials, ported from the old repo (`generate_bedrock_key`):
 * a SigV4-presigned `POST https://bedrock.amazonaws.com/?Action=CallWithBearerToken`, without the scheme,
 * with `&Version=1` appended after signing (AWS verifies the signature without it), base64-encoded.
 */
export async function bedrockMantleKey(creds: AwsCredentials, opts: { expiresIn?: number; signingDate?: Date } = {}): Promise<string> {
  const signer = new SignatureV4({
    service: 'bedrock', region: creds.region, sha256: Sha256,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey, ...(creds.sessionToken ? { sessionToken: creds.sessionToken } : {}) },
  });
  const signed = await signer.presign(
    { method: 'POST', protocol: 'https:', hostname: 'bedrock.amazonaws.com', path: '/', query: { Action: 'CallWithBearerToken' }, headers: { host: 'bedrock.amazonaws.com' } },
    { expiresIn: opts.expiresIn ?? 43_200, ...(opts.signingDate ? { signingDate: opts.signingDate } : {}) },
  );
  const query = Object.entries(signed.query ?? {})
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`).join('&');
  return `bedrock-api-key-${Buffer.from(`bedrock.amazonaws.com/?${query}&Version=1`, 'utf8').toString('base64')}`;
}
