import { BadRequestException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return true;
    if (request.headers['x-requested-with'] !== 'aitrader') throw new BadRequestException('X-Requested-With is required');
    return true;
  }
}
