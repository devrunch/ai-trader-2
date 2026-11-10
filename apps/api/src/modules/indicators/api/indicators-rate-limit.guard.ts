import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

export const INDICATORS_RATE_LIMIT = 'INDICATORS_RATE_LIMIT';

/** Nest builds guards itself; the module supplies the configured per-IP limiter under this token. */
@Injectable()
export class IndicatorsRateLimitGuard implements CanActivate {
  constructor(@Inject(INDICATORS_RATE_LIMIT) private readonly limiter: CanActivate) {}
  canActivate(context: ExecutionContext): boolean { return this.limiter.canActivate(context) === true; }
}
