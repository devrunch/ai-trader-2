import { Module } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server as HttpServer } from 'node:http';
import type { Redis } from 'ioredis';
import { REDIS } from '../../shared/redis';
import { AuthModule } from '../auth/auth.module';
import { CurrentUser } from '../auth/application/index';
import { InstrumentsModule } from '../instruments/instruments.module';
import { ResolveInstrument } from '../instruments/application/index';
import { MarketDataModule } from '../market-data/market-data.module';
import { AggregateLiveBars, MarketDataService, ReadSeq, RequestSubscription } from '../market-data/application/index';
import { LiveGateway } from './api/live.gateway';
import { LiveSubscriptions } from './application/live-subscriptions';
import { LiveDataAdapter } from './infrastructure/live-data.adapter';
import { RedisLiveUpdateBus } from './infrastructure/redis-live-update-bus';

class LiveGatewayLifecycle {
  constructor(private readonly host: HttpAdapterHost, private readonly gateway: LiveGateway) {}
  onModuleInit(): void {
    const server: unknown = this.host.httpAdapter.getHttpServer();
    if (!isHttpServer(server)) throw new Error('Nest HTTP server is unavailable');
    this.gateway.attach(server);
  }
  async onModuleDestroy(): Promise<void> { await this.gateway.close(); }
}

function isHttpServer(value: unknown): value is HttpServer {
  return typeof value === 'object' && value !== null && 'listen' in value && typeof value.listen === 'function'
    && 'on' in value && typeof value.on === 'function';
}

@Module({
  imports: [AuthModule, InstrumentsModule, MarketDataModule],
  providers: [
    { provide: RedisLiveUpdateBus, inject: [REDIS], useFactory: (redis: Redis) => new RedisLiveUpdateBus(redis) },
    { provide: LiveDataAdapter, inject: [ResolveInstrument, MarketDataService, ReadSeq, RequestSubscription, AggregateLiveBars, RedisLiveUpdateBus],
      useFactory: (instruments: ResolveInstrument, market: MarketDataService, seq: ReadSeq, requests: RequestSubscription, aggregate: AggregateLiveBars, bus: RedisLiveUpdateBus) =>
        new LiveDataAdapter(instruments, market, seq, requests, aggregate, bus) },
    { provide: LiveSubscriptions, inject: [LiveDataAdapter], useFactory: (data: LiveDataAdapter) => new LiveSubscriptions(data) },
    { provide: LiveGateway, inject: [CurrentUser, LiveSubscriptions], useFactory: (currentUser: CurrentUser, streams: LiveSubscriptions) => new LiveGateway(currentUser, {}, streams) },
    { provide: LiveGatewayLifecycle, inject: [HttpAdapterHost, LiveGateway], useFactory: (host: HttpAdapterHost, gateway: LiveGateway) => new LiveGatewayLifecycle(host, gateway) },
  ],
})
export class LiveModule {}
