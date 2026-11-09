import { useConnection } from '../../shared/live';

const labels = { connecting: 'Connecting…', live: 'Live', reconnecting: 'Reconnecting…', offline: 'Offline', unauthorized: 'Signed out' } as const;
const tones = { connecting: 'text-muted-foreground', live: 'text-up', reconnecting: 'text-warning', offline: 'text-down', unauthorized: 'text-down' } as const;

/** Always says whether prices are live (FR-UI-8). */
export function ConnectionIndicator() {
  const connection = useConnection();
  return <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 text-xs ${tones[connection.state]}`}>
    <span aria-hidden className="size-1.5 rounded-full bg-current" />{labels[connection.state]}
  </span>;
}
