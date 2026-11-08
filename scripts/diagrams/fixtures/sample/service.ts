import type { Port } from './port.ts';

export class Service {
  constructor(private readonly port: Port) {}
  run(): void { void this.port.get('sample'); }
}

// An empty base isolates the inheritance edge in the diagram fixture.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Base {}
export class Derived extends Base {}
