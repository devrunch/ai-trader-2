import type { DataStatus } from '@aitrader/contracts';

const reasons: Record<string, string> = {
  MARKET_CLOSED: 'Market closed', NO_DATA: 'No data yet', PROVIDER_DOWN: 'Data provider is down',
  AUTH_EXPIRED: 'Data login expired', RATE_LIMITED: 'Data provider is rate limiting', UNSUPPORTED: 'Not available for this symbol',
};

/** Plain words for a data status (FR-UI-7); undefined while it is simply live. */
export function statusText(status: DataStatus | undefined): string | undefined {
  if (!status || status.state === 'ok') return undefined;
  if (status.state === 'delayed') return `Delayed ${String(Math.round(status.delayMs / 60_000))} min`;
  return reasons[status.reason] ?? status.reason;
}
