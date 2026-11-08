export interface Bar {
  /** Bar start in epoch milliseconds UTC. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  repaired?: boolean;
}
