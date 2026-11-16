import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config';
import { NotFoundError } from '../errors';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/**
 * Read-only ops endpoints for the operator's own tooling: a shared token in the `x-ops-token` header. With no OPS_READ_TOKEN set,
 * the endpoints do not exist (404), so they cannot be probed.
 */
@Injectable()
export class OpsTokenGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.OPS_READ_TOKEN;
    const given = context.switchToHttp().getRequest<Request>().header('x-ops-token');
    if (!expected || !given || !timingSafeEqual(digest(given), digest(expected))) throw new NotFoundError('Not found');
    return true;
  }
}
