import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import pino from 'pino';
import { APP_CONFIG, type AppConfig } from '../config';
import { REDIS } from '../redis/redis.module';
import { recentLogStream } from './recent-logs';
import { resolveRequestId } from './request-id';

@Global()
@Module({
  imports: [LoggerModule.forRootAsync({
    inject: [APP_CONFIG, REDIS],
    useFactory: (config: AppConfig, redis: Redis) => ({
      pinoHttp: [{
        level: config.LOG_LEVEL,
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        genReqId: (req, res) => {
          const id = resolveRequestId(req.headers['x-request-id']);
          res.setHeader('x-request-id', id);
          return id;
        },
        // Every line still goes to stdout; warnings and errors are also kept in Redis for Admin and the ops endpoints.
      }, pino.multistream([
        { level: 'trace', stream: process.stdout },
        { level: 'warn', stream: recentLogStream(redis, process.argv[1]?.includes('market-data') ? 'market-data' : 'api') },
      ])],
    }),
  })],
  exports: [LoggerModule],
})
export class ObservabilityModule {}
