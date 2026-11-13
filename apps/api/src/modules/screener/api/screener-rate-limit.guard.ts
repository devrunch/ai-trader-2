import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

export const SCREENER_RATE_LIMIT = 'SCREENER_RATE_LIMIT';

/** Nest builds guards itself; the module supplies the configured limiter under this token. */
@Injectable()
export class ScreenerRateLimitGuard implements CanActivate {
  constructor(@Inject(SCREENER_RATE_LIMIT) private readonly limiter: CanActivate) {}
  canActivate(context: ExecutionContext): boolean { return this.limiter.canActivate(context) === true; }
}
