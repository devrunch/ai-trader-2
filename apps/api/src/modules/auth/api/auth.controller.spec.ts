import 'reflect-metadata';
import { Controller, Get, Post, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureApp } from '../../../app.setup.js';
import { GlobalExceptionFilter } from '../../../shared/errors/index.js';
import { CurrentUser, Login, Logout } from '../application/index.js';
import { Roles } from './roles.decorator.js';
import { AuthController } from './auth.controller.js';
import { AUTH_CLOCK, AuthRateLimitGuard } from './auth-rate-limit.guard.js';
import { RolesGuard } from './session.guard.js';
import { CsrfHeaderGuard } from './csrf-header.guard.js';

class TestUserSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean { context.switchToHttp().getRequest<{ authUser?: { role: string } }>().authUser = { role: 'user' }; return true; }
}

@Controller('v1/auth-test')
class AdminTestController {
  @Get('admin') @Roles('admin') @UseGuards(TestUserSessionGuard, RolesGuard)
  admin(): { ok: true } { return { ok: true }; }
}
@Controller('v1/auth-test-csrf')
class CsrfTestController {
  @Post('submit') @UseGuards(CsrfHeaderGuard)
  submit(): { ok: true } { return { ok: true }; }
}

let app: INestApplication<Server>;
const signIn = vi.fn(); const signOut = vi.fn(); const currentUser = vi.fn();
beforeEach(async () => {
  signIn.mockReset().mockResolvedValue({ user: { id: '00000000-0000-4000-8000-000000000001', username: 'admin', role: 'admin' }, sessionId: 'random-session-id' });
  signOut.mockReset().mockResolvedValue(undefined); currentUser.mockReset().mockResolvedValue(null);
  const module = await Test.createTestingModule({ controllers: [AuthController, AdminTestController, CsrfTestController], providers: [
    GlobalExceptionFilter, AuthRateLimitGuard, RolesGuard,
    { provide: Login, useValue: { execute: signIn } }, { provide: Logout, useValue: { execute: signOut } },
    { provide: CurrentUser, useValue: { execute: currentUser } }, { provide: 'AUTH_PRODUCTION', useValue: false },
    { provide: AUTH_CLOCK, useValue: () => Date.now() }, { provide: PinoLogger, useValue: new PinoLogger({ pinoHttp: { level: 'silent' } }) },
    TestUserSessionGuard,
  ] }).compile();
  app = module.createNestApplication(); configureApp(app); await app.init();
});
afterEach(async () => { await app.close(); });

it('sets an httpOnly SameSite=Strict cookie on login', async () => {
  const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('X-Requested-With', 'aitrader').send({ username: 'admin', password: 'long-enough-password' }).expect(200);
  const cookie = response.headers['set-cookie']?.[0] ?? '';
  expect(cookie).toContain('aitrader_session=random-session-id');
  expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict');
});
it('me returns 401 without a session', async () => { await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401); });
it('logout clears the session', async () => {
  const response = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('X-Requested-With', 'aitrader').set('Cookie', 'aitrader_session=opaque').expect(204);
  expect(signOut).toHaveBeenCalledWith('opaque'); expect(response.headers['set-cookie']?.[0] ?? '').toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
});
it('admin route returns 403 for a user role', async () => { await request(app.getHttpServer()).get('/api/v1/auth-test/admin').expect(403); });
it('state-changing requests require X-Requested-With', async () => { await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(400); });
it('csrf guard rejects POST without the header with 400', async () => { await request(app.getHttpServer()).post('/api/v1/auth-test-csrf/submit').expect(400); });
it('login is rate limited per IP', async () => {
  const attempts = await Promise.all(Array.from({ length: 6 }, () => request(app.getHttpServer()).post('/api/v1/auth/login').set('X-Requested-With', 'aitrader').send({ username: 'admin', password: 'long-enough-password' })));
  expect(attempts.filter(response => response.status === 200)).toHaveLength(5);
  expect(attempts.filter(response => response.status === 429)).toHaveLength(1);
});
