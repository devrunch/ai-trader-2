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
import { AggregateLiveBars, MarketDataService, ReadDepth, ReadSeq, RequestSubscription } from '../market-data/application/index';
import { LiveGateway } from './api/live.gateway';
import { LiveIndicators } from './application/live-indicators';
import { LiveSubscriptions } from './application/live-subscriptions';
import { LiveDepth } from './application/live-depth';
import { IndicatorService } from '../indicators/application/index';
import { IndicatorsModule } from '../indicators/indicators.module';
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
  imports: [AuthModule, InstrumentsModule, MarketDataModule, IndicatorsModule],
  providers: [
    { provide: RedisLiveUpdateBus, inject: [REDIS], useFactory: (redis: Redis) => new RedisLiveUpdateBus(redis) },
    { provide: LiveDataAdapter, inject: [ResolveInstrument, MarketDataService, ReadSeq, RequestSubscription, AggregateLiveBars, RedisLiveUpdateBus],
      useFactory: (instruments: ResolveInstrument, market: MarketDataService, seq: ReadSeq, requests: RequestSubscription, aggregate: AggregateLiveBars, bus: RedisLiveUpdateBus) =>
        new LiveDataAdapter(instruments, market, seq, requests, aggregate, bus) },
    { provide: LiveSubscriptions, inject: [LiveDataAdapter], useFactory: (data: LiveDataAdapter) => new LiveSubscriptions(data) },
    { provide: LiveGateway, inject: [CurrentUser, LiveSubscriptions, IndicatorService, LiveDataAdapter, ReadDepth],
      useFactory: (currentUser: CurrentUser, streams: LiveSubscriptions, engine: IndicatorService, data: LiveDataAdapter, depth: ReadDepth) => {
        // Indicators emit through the gateway, which takes them as a dependency: the holder breaks the cycle.
        const holder: { gateway?: LiveGateway } = {};
        const indicators = new LiveIndicators(streams, engine, (socketId, event, payload) => { holder.gateway?.emitTo(socketId, event, payload); });
        streams.attachTap(indicators);
        const liveDepth = new LiveDepth({ resolve: symbol => data.resolve(symbol), read: id => depth.execute(id) },
          (socketId, event, payload) => { holder.gateway?.emitTo(socketId, event, payload); });
        holder.gateway = new LiveGateway(currentUser, {}, streams, indicators, liveDepth);
        return holder.gateway;
      } },
    { provide: LiveGatewayLifecycle, inject: [HttpAdapterHost, LiveGateway], useFactory: (host: HttpAdapterHost, gateway: LiveGateway) => new LiveGatewayLifecycle(host, gateway) },
  ],
})
export class LiveModule {}
