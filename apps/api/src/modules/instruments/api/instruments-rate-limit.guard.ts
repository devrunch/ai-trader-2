import { Inject, Injectable } from '@nestjs/common';
import { IpRateLimitGuard } from '../../../shared/http/index.js';

export const CLOCK: symbol = Symbol('INSTRUMENTS_CLOCK');

@Injectable()
export class InstrumentsRateLimitGuard extends IpRateLimitGuard {
  constructor(@Inject(CLOCK) clock: () => number) {
    super(30, 10, clock);
  }
}
