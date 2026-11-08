import 'reflect-metadata';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { ErrorBodySchema } from '@aitrader/contracts';
import { GlobalExceptionFilter } from './shared/errors';
import { configureApp } from './app.setup';

@Controller()
class HealthController {
  @Get('health')
  health() { return { status: 'ok' }; }
}

// NFR-SC, NFR-QL: exercise the shared production setup with silent logging.
let app: INestApplication<Server>;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [GlobalExceptionFilter, { provide: PinoLogger, useValue: new PinoLogger({ pinoHttp: { level: 'silent' } }) }],
  }).compile();
  app = module.createNestApplication();
  configureApp(app);
  await app.init();
});
afterAll(async () => { await app.close(); });

it('configureApp removes x-powered-by', async () => {
  const response = await request(app.getHttpServer()).get('/health').expect(200);
  expect(response.headers['x-powered-by']).toBeUndefined();
});

it('configureApp maps errors through the global filter', async () => {
  const response = await request(app.getHttpServer()).get('/missing').expect(404);
  const body = ErrorBodySchema.parse(response.body);
  expect(body.code).toBe('NOT_FOUND');
  expect(body.requestId).toBeTruthy();
});
