import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaperAccountResponseSchema, PaperAccountsResponseSchema, PaperOrderResponseSchema, PaperPositionsResponseSchema } from '@aitrader/contracts';
import { configureApp } from '../../../app.setup';
import { GlobalExceptionFilter } from '../../../shared/errors';
import { CurrentUser } from '../../auth/application/index';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { CancelOrder, PlaceOrder, ReadPortfolio, type InCurrency, type OrderRecord } from '../application';
import { PaperController } from './paper.controller';

const userId = '00000000-0000-4000-8000-000000000007';
const orderId = '00000000-0000-4000-8000-0000000000aa';
const record: InCurrency<OrderRecord> = {
  id: orderId, accountId: 'acct', currency: 'INR', clientOrderId: 'web-1', instrumentId: 'NSE:INFY', segment: 'equity', tick: 0.05, side: 'buy', type: 'limit',
  product: 'MIS', quantity: 10, limitPrice: 1490, triggerPrice: null, stopLoss: null, target: null, status: 'open', triggered: false,
  rejectReason: null, closeReason: null, parentOrderId: null, referencePrice: 1500, fillPrice: null, placedAt: 1, expiresAt: 2, filledAt: null, updatedAt: 1,
};
const body = { clientOrderId: 'web-1', instrumentId: 'NSE:INFY', side: 'buy', type: 'limit', product: 'MIS', quantity: 10, limitPrice: 1490 };

describe('paper API FR-PT-1, FR-PT-3, NFR-SC-1', () => {
  let app: INestApplication<Server>;
  const place = { execute: vi.fn() }; const cancel = { execute: vi.fn() };
  const read = { account: vi.fn(), accounts: vi.fn(), orders: vi.fn(), positions: vi.fn(), fills: vi.fn() };
  const current = { execute: vi.fn() };
  const http = () => request(app.getHttpServer());
  const signedIn = (r: request.Test) => r.set('Cookie', 'aitrader_session=s1');

  beforeEach(async () => {
    for (const mock of [place.execute, cancel.execute, read.account, read.accounts, read.orders, read.positions, read.fills, current.execute]) mock.mockReset();
    current.execute.mockImplementation((id: string | undefined) => Promise.resolve(id === 's1' ? { id: userId, username: 'trader', role: 'user' } : null));
    const module = await Test.createTestingModule({ controllers: [PaperController], providers: [
      GlobalExceptionFilter, SessionGuard, CsrfHeaderGuard, { provide: CurrentUser, useValue: current },
      { provide: PlaceOrder, useValue: place }, { provide: CancelOrder, useValue: cancel }, { provide: ReadPortfolio, useValue: read },
      { provide: PinoLogger, useValue: new PinoLogger({ pinoHttp: { level: 'silent' } }) },
    ] }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
  });
  afterEach(async () => { await app.close(); });

  it('requires a session', async () => { await http().get('/api/v1/paper/account').expect(401); });

  it('returns the account', async () => {
    read.account.mockResolvedValue({ id: 'acct', currency: 'INR', initialCash: 1e6, cash: 1e6, usedMargin: 0, available: 1e6, realisedPnl: 0, charges: 0 });
    const response = await signedIn(http().get('/api/v1/paper/account')).expect(200);
    expect(PaperAccountResponseSchema.parse(response.body).account.available).toBe(1e6);
    expect(read.account).toHaveBeenCalledWith(userId);
  });

  it('lists one account per currency', async () => {
    const inr = { id: 'a1', currency: 'INR', initialCash: 1e6, cash: 1e6, usedMargin: 0, available: 1e6, realisedPnl: 0, charges: 0 };
    read.accounts.mockResolvedValue([inr, { ...inr, id: 'a2', currency: 'USD', initialCash: 1e5, cash: 1e5, available: 1e5 }]);
    const response = await signedIn(http().get('/api/v1/paper/accounts')).expect(200);
    expect(PaperAccountsResponseSchema.parse(response.body).accounts.map(a => a.currency)).toEqual(['INR', 'USD']);
  });

  it('requires the CSRF header to place an order', async () => {
    await signedIn(http().post('/api/v1/paper/orders')).send(body).expect(400);
    expect(place.execute).not.toHaveBeenCalled();
  });

  it('places an order and answers with the public order shape', async () => {
    place.execute.mockResolvedValue(record);
    const response = await signedIn(http().post('/api/v1/paper/orders')).set('X-Requested-With', 'aitrader').send(body).expect(201);
    expect(PaperOrderResponseSchema.parse(response.body).order).toMatchObject({ id: orderId, status: 'open', limitPrice: 1490 });
    expect(response.body).not.toHaveProperty('order.accountId');
    expect(place.execute).toHaveBeenCalledWith(userId, body);
  });

  it('rejects malformed orders before they reach the use case', async () => {
    const response = await signedIn(http().post('/api/v1/paper/orders')).set('X-Requested-With', 'aitrader').send({ ...body, quantity: 0 }).expect(422);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(place.execute).not.toHaveBeenCalled();
  });

  it('cancels by id and validates the id', async () => {
    cancel.execute.mockResolvedValue({ ...record, status: 'cancelled', closeReason: 'USER' });
    await signedIn(http().post('/api/v1/paper/orders/not-a-uuid/cancel')).set('X-Requested-With', 'aitrader').expect(422);
    const response = await signedIn(http().post(`/api/v1/paper/orders/${orderId}/cancel`)).set('X-Requested-With', 'aitrader').expect(200);
    expect(response.body).toMatchObject({ order: { status: 'cancelled', closeReason: 'USER' } });
    expect(cancel.execute).toHaveBeenCalledWith(userId, orderId);
  });

  it('lists open orders on request', async () => {
    read.orders.mockResolvedValue([record]);
    await signedIn(http().get('/api/v1/paper/orders?status=open')).expect(200);
    expect(read.orders).toHaveBeenCalledWith(userId, { openOnly: true, limit: 200 });
  });

  it('lists positions marked to market', async () => {
    read.positions.mockResolvedValue([{ id: 'p', accountId: 'acct', currency: 'INR', instrumentId: 'NSE:INFY', segment: 'equity', tick: 0.05, product: 'MIS', quantity: 10,
      averagePrice: 1490, realisedPnl: 0, squareOffAt: 2, updatedAt: 1, lastPrice: 1500, unrealisedPnl: 100 }]);
    const response = await signedIn(http().get('/api/v1/paper/positions')).expect(200);
    expect(PaperPositionsResponseSchema.parse(response.body).positions).toEqual([{ instrumentId: 'NSE:INFY', currency: 'INR', product: 'MIS', quantity: 10,
      averagePrice: 1490, realisedPnl: 0, lastPrice: 1500, unrealisedPnl: 100, squareOffAt: 2 }]);
  });
});
