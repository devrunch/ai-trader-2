import 'reflect-metadata';
import { type CanActivate, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureApp } from '../../../app.setup';
import { GlobalExceptionFilter } from '../../../shared/errors';
import { RolesGuard, SessionGuard } from '../../auth/api/index';
import type { PromptVersion } from '../application/prompt-registry';
import { PromptRegistry } from '../application/prompt-registry';
import { PromptsController } from './prompts.controller';

let role: 'admin' | 'user' = 'admin';
class TestSession implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<{ authUser?: { role: string; username: string } }>().authUser = { role, username: 'owner' };
    return true;
  }
}
let app: INestApplication<Server>;
let rows: PromptVersion[];
beforeEach(async () => {
  role = 'admin'; rows = [];
  const registry = new PromptRegistry(
    { history: key => Promise.resolve(rows.filter(r => r.key === key).sort((a, b) => b.version - a.version)), append: v => { rows.push(v); return Promise.resolve(); } },
    { keys: () => ['system'], read: key => (key === 'system' ? 'Default.' : null) });
  const module = await Test.createTestingModule({ controllers: [PromptsController], providers: [RolesGuard, GlobalExceptionFilter,
    { provide: PinoLogger, useValue: { warn: vi.fn(), error: vi.fn() } }, { provide: PromptRegistry, useValue: registry }] })
    .overrideGuard(SessionGuard).useClass(TestSession).compile();
  app = module.createNestApplication(); configureApp(app); await app.init();
});
afterEach(async () => { await app.close(); });
const http = () => request(app.getHttpServer());

it('is admin only', async () => {
  role = 'user';
  await http().get('/api/v1/admin/prompts').expect(403);
});

it('lists prompts with their active version and source', async () => {
  await http().get('/api/v1/admin/prompts').expect(200, [{ key: 'system', version: 0, source: 'file' }]);
});

it('saves a version authored by the session user, and requires the CSRF header', async () => {
  await http().post('/api/v1/admin/prompts/system').send({ content: 'Edited.', message: 'edit' }).expect(400);
  const res = await http().post('/api/v1/admin/prompts/system').set('X-Requested-With', 'aitrader').send({ content: 'Edited.', message: 'edit' }).expect(200);
  expect(res.body).toMatchObject({ version: { version: 1, author: 'owner', message: 'edit' } });
});

it('reverts and diffs through HTTP; unknown prompts are 404', async () => {
  await http().post('/api/v1/admin/prompts/system').set('X-Requested-With', 'aitrader').send({ content: 'Edited.', message: 'edit' });
  await http().post('/api/v1/admin/prompts/system/revert').set('X-Requested-With', 'aitrader').send({ version: 0 }).expect(200);
  const detail = await http().get('/api/v1/admin/prompts/system').expect(200);
  expect(detail.body).toMatchObject({ active: { version: 2, content: 'Default.' } });
  await http().get('/api/v1/admin/prompts/system/diff?from=0&to=1').expect(200, [{ op: '-', line: 'Default.' }, { op: '+', line: 'Edited.' }]);
  await http().get('/api/v1/admin/prompts/nope').expect(404);
});
