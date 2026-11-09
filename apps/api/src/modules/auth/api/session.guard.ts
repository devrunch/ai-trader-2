import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CurrentUser } from '../application/current-user.js';
import { ROLES_KEY } from './roles.decorator.js';
import { z } from 'zod';
const sessionCookie = 'aitrader_session';
type AuthRequest = Request & { authUser?: { id: string; username: string; role: 'admin' | 'user' } };
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(CurrentUser) private readonly current: CurrentUser) {}
  async canActivate(context: ExecutionContext): Promise<boolean> { const req = context.switchToHttp().getRequest<AuthRequest>(); const cookieValue: unknown = req.cookies[sessionCookie]; const id = z.string().optional().parse(cookieValue); const user = await this.current.execute(id); if (!user) throw new UnauthorizedException('Authentication required'); req.authUser = user; return true; }
}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean { const metadata: unknown = this.reflector.getAllAndOverride<readonly string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]); const roles = z.array(z.string()).optional().parse(metadata); if (!roles || roles.length === 0) return true; const req = context.switchToHttp().getRequest<AuthRequest>(); if (!req.authUser || !roles.includes(req.authUser.role)) throw new ForbiddenException(); return true; }
}
