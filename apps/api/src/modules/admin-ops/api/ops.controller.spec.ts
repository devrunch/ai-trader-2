import 'reflect-metadata';
import { type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DataSourcesResponseSchema, OpsFeedsSchema, OpsInstrumentsSchema, OpsJobsSchema } from '@aitrader/contracts';
import { configureApp } from '../../../app.setup.js';
import { GlobalExceptionFilter } from '../../../shared/errors/index.js';
import { RolesGuard, SessionGuard } from '../../auth/api/index.js';
import { OpsSources } from '../application/ops-sources.js';
import { OpsOverview } from '../application/ops-overview.js';
import { OpsController } from './ops.controller.js';

let role: 'admin' | 'user' | null = 'admin';
class TestSession implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (role === null) return false;
    context.switchToHttp().getRequest<{ authUser?: { role: string } }>().authUser = { role };
    return true;
  }
}
let app: INestApplication<Server>;
const listSources = vi.fn();
const feeds = vi.fn(); const jobs = vi.fn(); const runJob = vi.fn(); const instruments = vi.fn(); const refreshInstruments = vi.fn();

beforeEach(async () => {
  role = 'admin';
  feeds.mockReset().mockResolvedValue({ leader: { instanceId: 'md-1', ttlMs: 9000 },
    vendors: [{ vendor: 'kite', state: 'live', at: 1 }, { vendor: 'deriv', state: 'stale', reason: 'PROVIDER_DOWN', at: 2 }, { vendor: 'us-delayed', state: 'unknown' }],
    subscriptions: [{ instrumentId: 'NSE:RELIANCE', count: 2 }] });
  jobs.mockReset().mockResolvedValue([{ name: 'instruments-refresh', cron: '0 7 * * *', tz: 'Asia/Kolkata',
    lastRun: { at: '2026-11-09T01:30:00.000Z', outcome: 'ok' }, next: '2026-11-10T01:30:00.000Z' }]);
  runJob.mockReset().mockResolvedValue(true);
  instruments.mockReset().mockResolvedValue({ sources: [{ source: 'kite', status: 'ok', count: 90000, lastSuccessAt: '2026-11-09T01:31:00+00:00' }], total: 90000 });
  listSources.mockReset().mockResolvedValue({ sources: [] });
  refreshInstruments.mockReset().mockResolvedValue(true);
  const module = await Test.createTestingModule({ controllers: [OpsController], providers: [RolesGuard, GlobalExceptionFilter,
    { provide: PinoLogger, useValue: { warn: vi.fn(), error: vi.fn() } },
    { provide: OpsOverview, useValue: { feeds, jobs, runJob, instruments, refreshInstruments } },
    { provide: OpsSources, useValue: { list: listSources } },
  ] }).overrideGuard(SessionGuard).useClass(TestSession).compile();
  app = module.createNestApplication(); configureApp(app); await app.init();
});
afterEach(async () => { await app.close(); });

const http = () => request(app.getHttpServer());

it('ops endpoints require the admin role', async () => {
  role = 'user';
  await http().get('/api/v1/admin/ops/feeds').expect(403);
  role = null;
  await http().get('/api/v1/admin/ops/jobs').expect(403);
});

it('feeds returns vendor states and the leader', async () => {
  const response = await http().get('/api/v1/admin/ops/feeds').expect(200);
  expect(OpsFeedsSchema.parse(response.body).leader?.instanceId).toBe('md-1');
});

it('jobs lists last runs and run-now returns 202', async () => {
  const response = await http().get('/api/v1/admin/ops/jobs').expect(200);
  expect(OpsJobsSchema.parse(response.body)[0]?.name).toBe('instruments-refresh');
  await http().post('/api/v1/admin/ops/jobs/instruments-refresh/run').set('X-Requested-With', 'aitrader').expect(202);
  expect(runJob).toHaveBeenCalledWith('instruments-refresh');
});

it('run-now requires the CSRF header', async () => {
  await http().post('/api/v1/admin/ops/jobs/instruments-refresh/run').expect(400);
  expect(runJob).not.toHaveBeenCalled();
});

it('unknown job returns 404', async () => {
  runJob.mockResolvedValue(false);
  await http().post('/api/v1/admin/ops/jobs/nope/run').set('X-Requested-With', 'aitrader').expect(404);
});

it('instruments refresh goes through the job', async () => {
  const response = await http().get('/api/v1/admin/ops/instruments').expect(200);
  expect(OpsInstrumentsSchema.parse(response.body).total).toBe(90000);
  await http().post('/api/v1/admin/ops/instruments/refresh').set('X-Requested-With', 'aitrader').expect(202);
  expect(refreshInstruments).toHaveBeenCalled();
});

it('sources lists the registry for admins only', async () => {
  const response = await http().get('/api/v1/admin/ops/sources').expect(200);
  expect(DataSourcesResponseSchema.parse(response.body)).toEqual({ sources: [] });
  role = 'user';
  await http().get('/api/v1/admin/ops/sources').expect(403);
});
