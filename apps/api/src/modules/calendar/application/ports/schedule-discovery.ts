import type { ScheduledRelease } from '../../domain/india-schedule';

/** Finds the release schedule an institution currently publishes; throws when the publication cannot be read, so the caller falls back to its vendored list. */
export interface ScheduleDiscovery { discover(signal: AbortSignal): Promise<ScheduledRelease[]> }
