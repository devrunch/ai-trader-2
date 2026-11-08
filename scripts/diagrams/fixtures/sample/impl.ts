import type { Port } from './port.ts';

export class Impl implements Port {
  get(id: string): Promise<number> { return Promise.resolve(id.length); }
}
