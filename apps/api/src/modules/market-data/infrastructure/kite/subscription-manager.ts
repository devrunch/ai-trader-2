import { DomainError } from '../../../../shared/errors';

class InstrumentCapError extends DomainError {
  readonly code = 'UNSUPPORTED';
  readonly httpStatus = 422;
  constructor() { super('kite instrument cap reached', { detail: 'kite instrument cap reached' }); }
}
export class SubscriptionManager {
  private readonly connections: Set<string>[] = [];
  add(token: string): number {
    const existing = this.connections.findIndex(group => group.has(token));
    if (existing >= 0) return existing;
    let index = this.connections.findIndex(group => group.size < 3000);
    if (index < 0) {
      if (this.connections.length === 3) throw new InstrumentCapError();
      index = this.connections.length; this.connections.push(new Set());
    }
    this.connections[index]?.add(token); return index;
  }
  remove(token: string): void { for (const group of this.connections) group.delete(token); }
  groups(): string[][] { return this.connections.map(group => [...group]); }
}
