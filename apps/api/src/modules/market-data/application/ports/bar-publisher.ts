import type { Bar } from '../../domain/bar';

export interface BarPublisher {
  publish(instrumentId: string, kind: 'forming' | 'closed', bar: Bar): Promise<number>;
}
