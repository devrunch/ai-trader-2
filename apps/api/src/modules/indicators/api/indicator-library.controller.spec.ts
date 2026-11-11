import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndicatorPresetListSchema, IndicatorTemplateListSchema } from '@aitrader/contracts';
import { configureApp } from '../../../app.setup';
import { GlobalExceptionFilter, NotFoundError } from '../../../shared/errors';
import { CurrentUser } from '../../auth/application/index';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { IndicatorPresets, IndicatorTemplates } from '../application';
import { IndicatorLibraryController } from './indicator-library.controller';

const userId = '00000000-0000-4000-8000-000000000007';
const rowId = '00000000-0000-4000-8000-0000000000aa';
const preset = { id: rowId, indicatorId: 'sma', name: 'Slow', inputs: { length: 200 } };
const template = { id: rowId, name: 'Trend', favourite: false, items: [{ key: 'ind-1', id: 'sma', inputs: { length: 20 } }] };

describe('indicator presets and templates API FR-IN-12, FR-IN-14', () => {
  let app: INestApplication<Server>;
  const presets = { list: vi.fn(), saveDefault: vi.fn(), create: vi.fn(), remove: vi.fn() };
  const templates = { list: vi.fn(), create: vi.fn(), setFavourite: vi.fn(), remove: vi.fn() };
  const current = { execute: vi.fn() };
  const http = () => request(app.getHttpServer());
  const signedIn = (r: request.Test) => r.set('Cookie', 'aitrader_session=s1');
  const write = (r: request.Test) => signedIn(r).set('X-Requested-With', 'aitrader');

  beforeEach(async () => {
    for (const mock of [...Object.values(presets), ...Object.values(templates), current.execute]) mock.mockReset();
    current.execute.mockImplementation((id: string | undefined) => Promise.resolve(id === 's1' ? { id: userId, username: 'trader', role: 'user' } : null));
    const module = await Test.createTestingModule({ controllers: [IndicatorLibraryController], providers: [
      GlobalExceptionFilter, SessionGuard, CsrfHeaderGuard, { provide: CurrentUser, useValue: current },
      { provide: IndicatorPresets, useValue: presets }, { provide: IndicatorTemplates, useValue: templates },
      { provide: PinoLogger, useValue: new PinoLogger({ pinoHttp: { level: 'silent' } }) },
    ] }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
  });
  afterEach(async () => { await app.close(); });

  it('requires a session', async () => {
    await http().get('/api/v1/indicators/presets').expect(401);
    await http().get('/api/v1/indicators/templates').expect(401);
  });

  it('requires the CSRF header on writes', async () => {
    await signedIn(http().post('/api/v1/indicators/presets')).send({ indicatorId: 'sma', name: 'Slow', inputs: {} }).expect(400);
    await signedIn(http().delete(`/api/v1/indicators/templates/${rowId}`)).expect(400);
    expect(presets.create).not.toHaveBeenCalled();
  });

  it('lists, saves a default, creates and deletes presets for the signed-in user', async () => {
    presets.list.mockResolvedValue([preset]);
    const listed = await signedIn(http().get('/api/v1/indicators/presets')).expect(200);
    expect(IndicatorPresetListSchema.parse(listed.body).presets).toHaveLength(1);
    expect(presets.list).toHaveBeenCalledWith(userId);

    presets.saveDefault.mockResolvedValue({ ...preset, name: null });
    await write(http().put('/api/v1/indicators/presets/defaults/sma')).send({ inputs: { length: 50 } }).expect(200);
    expect(presets.saveDefault).toHaveBeenCalledWith(userId, 'sma', { length: 50 });

    presets.create.mockResolvedValue(preset);
    await write(http().post('/api/v1/indicators/presets')).send({ indicatorId: 'sma', name: 'Slow', inputs: { length: 200 } }).expect(201);
    expect(presets.create).toHaveBeenCalledWith(userId, 'sma', 'Slow', { length: 200 });

    presets.remove.mockResolvedValue(undefined);
    await write(http().delete(`/api/v1/indicators/presets/${rowId}`)).expect(204);
    expect(presets.remove).toHaveBeenCalledWith(userId, rowId);
  });

  it('rejects a malformed preset body with 422', async () => {
    await write(http().post('/api/v1/indicators/presets')).send({ indicatorId: 'SMA!', name: '', inputs: {} }).expect(422);
  });

  it('lists, creates, favourites and deletes templates', async () => {
    templates.list.mockResolvedValue([template]);
    const listed = await signedIn(http().get('/api/v1/indicators/templates')).expect(200);
    expect(IndicatorTemplateListSchema.parse(listed.body).templates[0]?.name).toBe('Trend');

    templates.create.mockResolvedValue(template);
    await write(http().post('/api/v1/indicators/templates')).send({ name: 'Trend', items: template.items }).expect(201);
    expect(templates.create).toHaveBeenCalledWith(userId, 'Trend', template.items);

    templates.setFavourite.mockResolvedValue({ ...template, favourite: true });
    const patched = await write(http().patch(`/api/v1/indicators/templates/${rowId}`)).send({ favourite: true }).expect(200);
    expect(patched.body).toMatchObject({ template: { favourite: true } });

    templates.remove.mockRejectedValue(new NotFoundError('Template not found', { id: rowId }));
    await write(http().delete(`/api/v1/indicators/templates/${rowId}`)).expect(404);
  });

  it('refuses an empty template', async () => {
    await write(http().post('/api/v1/indicators/templates')).send({ name: 'Empty', items: [] }).expect(422);
  });
});
