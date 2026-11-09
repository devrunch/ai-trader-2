import 'reflect-metadata';
import { type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureApp } from '../../../app.setup.js';
import { GlobalExceptionFilter } from '../../../shared/errors/index.js';
import { RolesGuard, SessionGuard } from '../../auth/api/index.js';
import { ZerodhaConnect } from '../application/zerodha-connect.js';
import { ZerodhaController } from './zerodha.controller.js';

let role: 'admin' | 'user' = 'admin';
class TestSession implements CanActivate {
  canActivate(context: ExecutionContext): boolean { context.switchToHttp().getRequest<{ authUser?: { role: string } }>().authUser = { role }; return true; }
}
let app: INestApplication<Server>;
const status = vi.fn(); const connect = vi.fn(); const autoLogin = vi.fn(); const disconnect = vi.fn();
beforeEach(async () => {
  role = 'admin';
  status.mockReset().mockResolvedValue({ connected: false, autoLogin: { enabled: false, attemptsToday: 0, cap: 6 }, loginUrl: 'https://kite.zerodha.com/connect/login?v=3&api_key=key', redirectUrl: 'http://localhost:5173/admin/zerodha/callback' });
  connect.mockReset().mockResolvedValue({ connected: true, expiresAt: '2026-11-09T00:30:00.000Z' });
  autoLogin.mockReset().mockResolvedValue({ connected: true, expiresAt: '2026-11-09T00:30:00.000Z' });
  disconnect.mockReset().mockResolvedValue({ connected: false });
  const module = await Test.createTestingModule({ controllers: [ZerodhaController], providers: [RolesGuard, GlobalExceptionFilter, { provide: PinoLogger, useValue: { warn: vi.fn(), error: vi.fn() } },
    { provide: ZerodhaConnect, useValue: { status, connect, autoLogin, disconnect } },
  ] }).overrideGuard(SessionGuard).useClass(TestSession).compile();
  app = module.createNestApplication(); configureApp(app); await app.init();
});
afterEach(async () => { await app.close(); });

it('manual token paste stores the session', async () => {
  await request(app.getHttpServer()).post('/api/v1/admin/zerodha/token').set('X-Requested-With', 'aitrader').send({ requestToken: 'Manual123' }).expect(201, { connected: true, expiresAt: '2026-11-09T00:30:00.000Z' });
  expect(connect).toHaveBeenCalledWith('Manual123');
});
it('malformed request token returns 400', async () => {
  await request(app.getHttpServer()).post('/api/v1/admin/zerodha/token').set('X-Requested-With', 'aitrader').send({ requestToken: 'bad?' }).expect(400)
    .expect(response => { expect(response.body).toMatchObject({ code: 'VALIDATION', details: { reason: 'INVALID_REQUEST_TOKEN' } }); });
  expect(connect).not.toHaveBeenCalled();
});
it('status never contains the access token', async () => {
  const response = await request(app.getHttpServer()).get('/api/v1/admin/zerodha').expect(200);
  expect(JSON.stringify(response.body)).toContain('http://localhost:5173/admin/zerodha/callback');
  expect(JSON.stringify(response.body)).not.toContain('access_token');
  expect(JSON.stringify(response.body)).not.toContain('persisted-secret-token');
});
it('endpoints require the admin role', async () => {
  role = 'user';
  await request(app.getHttpServer()).get('/api/v1/admin/zerodha').expect(403);
});
