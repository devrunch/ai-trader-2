import 'reflect-metadata';
import { type CanActivate, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureApp } from '../../../app.setup';
import { GlobalExceptionFilter } from '../../../shared/errors';
import { SessionGuard } from '../../auth/api/index';
import { PineScripts } from '../application/pine-scripts';
import { PineScriptsController } from './pine-scripts.controller';

const ID = '00000000-0000-4000-8000-000000000001';
const detail = { id: ID, name: 'RSI', currentVersion: 1, sourceHash: 'a'.repeat(64), updatedAt: '2026-11-11T09:00:00.000Z', source: 'x', shownVersion: 1, versions: [] };
let signedIn = true;
class TestSession implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!signedIn) return false;
    context.switchToHttp().getRequest<{ authUser?: { id: string } }>().authUser = { id: 'u1' };
    return true;
  }
}
const service = { list: vi.fn(), create: vi.fn(), get: vi.fn(), save: vi.fn(), remove: vi.fn() };
let app: INestApplication<Server>;
beforeEach(async () => {
  signedIn = true;
  Object.values(service).forEach(f => { f.mockReset().mockResolvedValue(detail); });
  const module = await Test.createTestingModule({ controllers: [PineScriptsController], providers: [GlobalExceptionFilter,
    { provide: PinoLogger, useValue: { warn: vi.fn(), error: vi.fn() } }, { provide: PineScripts, useValue: service }] })
    .overrideGuard(SessionGuard).useClass(TestSession).compile();
  app = module.createNestApplication(); configureApp(app); await app.init();
});
afterEach(async () => { await app.close(); });
const http = () => request(app.getHttpServer());
const csrf = { 'X-Requested-With': 'aitrader' };

it('rejects an unauthenticated request', async () => {
  signedIn = false;
  await http().get('/api/v1/pine-scripts').expect(403);
});

it('rejects a write without the CSRF header', async () => {
  await http().post('/api/v1/pine-scripts').send({ name: 'RSI', source: 'x' }).expect(400);
  await http().put(`/api/v1/pine-scripts/${ID}`).send({ source: 'x' }).expect(400);
  await http().delete(`/api/v1/pine-scripts/${ID}`).expect(400);
  expect(service.create).not.toHaveBeenCalled();
});

it('answers 422 for a bad body', async () => {
  await http().post('/api/v1/pine-scripts').set(csrf).send({ name: '', source: 'x' }).expect(422);
  await http().put(`/api/v1/pine-scripts/${ID}`).set(csrf).send({ source: '' }).expect(422);
});

it('creates, reads a version, saves and deletes for the session user', async () => {
  await http().post('/api/v1/pine-scripts').set(csrf).send({ name: 'RSI', source: 'x' }).expect(201);
  expect(service.create).toHaveBeenCalledWith('u1', { name: 'RSI', source: 'x' });
  await http().get(`/api/v1/pine-scripts/${ID}?version=3`).expect(200);
  expect(service.get).toHaveBeenCalledWith('u1', ID, 3);
  await http().put(`/api/v1/pine-scripts/${ID}`).set(csrf).send({ source: 'y' }).expect(200);
  await http().delete(`/api/v1/pine-scripts/${ID}`).set(csrf).expect(204);
  expect(service.remove).toHaveBeenCalledWith('u1', ID);
});
