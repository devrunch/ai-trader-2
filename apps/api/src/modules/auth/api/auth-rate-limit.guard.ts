import { Inject, Injectable } from '@nestjs/common';
import { IpRateLimitGuard } from '../../../shared/http/index.js';
export const AUTH_CLOCK = Symbol('AUTH_CLOCK');
@Injectable()
export class AuthRateLimitGuard extends IpRateLimitGuard { constructor(@Inject(AUTH_CLOCK) clock: () => number) { super(5, 5 / 60, clock); } }
