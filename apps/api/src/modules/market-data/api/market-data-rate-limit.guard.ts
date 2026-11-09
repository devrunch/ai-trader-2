import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { IpRateLimitGuard } from '../../../shared/http';

// Nest instantiates @UseGuards classes itself; delegating lets the module supply the configured limiter.
@Injectable()
export class MarketDataRateLimitGuard implements CanActivate {
  constructor(@Inject(IpRateLimitGuard) private readonly limiter: IpRateLimitGuard) {}

  canActivate(context: ExecutionContext): boolean {
    return this.limiter.canActivate(context);
  }
}
