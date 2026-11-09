import { GlobalExceptionFilter } from './shared/errors';
import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfigModule, type AppConfig } from './shared/config';
import { ObservabilityModule } from './shared/observability';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './shared/database';
import { RedisModule } from './shared/redis';
import { KiteModule } from './shared/vendors/kite';
import { JobSchedulerModule } from './shared/jobs';
import { InstrumentsApiModule } from './modules/instruments/instruments.module';
import { MarketDataApiModule } from './modules/market-data/market-data.module';
import { AuthModule } from './modules/auth/auth.module';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server as HttpServer } from 'node:http';
import type { Redis } from 'ioredis';
import { REDIS } from './shared/redis';
import { CurrentUser } from './modules/auth/application/index';
import { ResolveInstrument } from './modules/instruments/application/index';
import { AggregateLiveBars, MarketDataService, ReadSeq, RequestSubscription } from './modules/market-data/application/index';
import { LiveGateway } from './modules/live/api/live.gateway';
import { LiveSubscriptions } from './modules/live/application/live-subscriptions';
import { LiveDataAdapter } from './modules/live/infrastructure/live-data.adapter';
import { RedisLiveUpdateBus } from './modules/live/infrastructure/redis-live-update-bus';

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
import { AdminOpsModule } from './modules/admin-ops/admin-ops.module';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      providers: [GlobalExceptionFilter,
        { provide: RedisLiveUpdateBus, inject: [REDIS], useFactory: (redis: Redis) => new RedisLiveUpdateBus(redis) },
        { provide: LiveDataAdapter, inject: [ResolveInstrument, MarketDataService, ReadSeq, RequestSubscription, AggregateLiveBars, RedisLiveUpdateBus],
          useFactory: (instruments: ResolveInstrument, market: MarketDataService, seq: ReadSeq, requests: RequestSubscription, aggregate: AggregateLiveBars, bus: RedisLiveUpdateBus) =>
            new LiveDataAdapter(instruments, market, seq, requests, aggregate, bus) },
        { provide: LiveSubscriptions, inject: [LiveDataAdapter], useFactory: (data: LiveDataAdapter) => new LiveSubscriptions(data) },
        { provide: LiveGateway, inject: [CurrentUser, LiveSubscriptions], useFactory: (currentUser: CurrentUser, streams: LiveSubscriptions) => new LiveGateway(currentUser, {}, streams) },
        { provide: LiveGatewayLifecycle, inject: [HttpAdapterHost, LiveGateway], useFactory: (host: HttpAdapterHost, gateway: LiveGateway) => new LiveGatewayLifecycle(host, gateway) },
      ],
      imports: [AppConfigModule.forRoot(config), ObservabilityModule, HealthModule, DatabaseModule, RedisModule, JobSchedulerModule, KiteModule,
        InstrumentsApiModule, MarketDataApiModule, AuthModule, AdminOpsModule],
    };
  }
}
