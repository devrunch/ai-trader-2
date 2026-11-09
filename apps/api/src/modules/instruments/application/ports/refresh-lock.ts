import type { RefreshReport } from '../refresh-report.js';

export interface RefreshLock {
  run(work: () => Promise<RefreshReport>, signal: AbortSignal): Promise<RefreshReport>;
}
