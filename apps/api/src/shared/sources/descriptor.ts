/** One external data source, as the single registry lists it (docs/DATA-SOURCES.md). */
export interface SourceDescriptor {
  /** Stable id, also the file name of its adapter: `<id>.source.ts`. */
  id: string;
  /** The module that owns this kind of data and the adapter file. */
  owner: string;
  kind: string;
  markets: string[];
  /** Config keys that must all be set for the source to run; none means it always runs. */
  envKeys: string[];
  /** At most `requests` per `windowSec` seconds, shared by every process through Redis. */
  rateLimit: { requests: number; windowSec: number };
  /** A cron expression, or 'on-demand'. */
  schedule: string;
  /** One line: which endpoint is used and why that is allowed. */
  terms: string;
  docs: string;
}

export type SourceState = 'enabled' | 'off';
