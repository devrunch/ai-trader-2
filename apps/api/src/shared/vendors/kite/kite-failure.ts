export type KiteFailureStage = 'login' | 'twofa' | 'redirect' | 'session' | 'unknown';
export interface KiteLoginFailure { stage: KiteFailureStage; message: string; httpStatus?: number; at: Date }

const MAX_MESSAGE = 200;
// Redacts configured secret values first, then anything shaped like a token or one-time code.
export function sanitizeFailureMessage(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) if (secret.length >= 4) out = out.split(secret).join('[redacted]');
  out = out
    .replace(/https?:\/\/[^\s"']+/gi, url => { try { const parsed = new URL(url); return parsed.origin + parsed.pathname; } catch { return '[url]'; } })
    .replace(/\b(?:authorization|set-cookie|cookie)\s*[=:].*/gi, '[redacted]')
    .replace(/\b(?:request_token|access_token|enctoken|checksum|password|secret|api_key|apikey|kf_session|public_token|totp\w*)\s*[=:]\s*\S+/gi, '[redacted]')
    .replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]')
    .replace(/\b\d{6}\b/g, '[redacted]')
    .replace(/\s+/g, ' ').trim();
  return out.length > MAX_MESSAGE ? `${out.slice(0, MAX_MESSAGE - 1)}…` : out;
}
