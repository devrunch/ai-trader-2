import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

export const STRATEGIES_RATE_LIMIT = 'STRATEGIES_RATE_LIMIT';

/** Nest builds guards itself; the module supplies the configured limiter under this token. */
@Injectable()
export class StrategiesRateLimitGuard implements CanActivate {
  constructor(@Inject(STRATEGIES_RATE_LIMIT) private readonly limiter: CanActivate) {}
  canActivate(context: ExecutionContext): boolean { return this.limiter.canActivate(context) === true; }
}
