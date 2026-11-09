import { ApiError } from '../../shared/api/api-error';

const messages: Record<string, string> = {
  connected: 'Zerodha connected.',
  ACCOUNT_MISMATCH: 'That token belongs to a different Zerodha account. Log in with the configured account.',
  INVALID_REQUEST_TOKEN: 'The request token is invalid or already used. Connect again.',
  CALLBACK_FAILED: 'Zerodha did not complete the login. Connect again.',
  EXCHANGE_FAILED: 'Zerodha rejected the token exchange. Connect again.',
  CAPTCHA_REQUIRED: 'Zerodha asked for a CAPTCHA; automatic login is paused for 24 hours.',
};

/** The `reason` a failed connect carries, or a generic code. */
export function connectFailureReason(error: unknown): string {
  const reason = error instanceof ApiError ? error.details?.reason : undefined;
  if (typeof reason === 'string') return reason;
  return 'CONNECT_FAILED';
}

export function noticeMessage(notice: string): string { return messages[notice] ?? 'Connecting Zerodha failed. Try again.'; }

export function connectFailureMessage(error: unknown): string { return noticeMessage(connectFailureReason(error)); }
