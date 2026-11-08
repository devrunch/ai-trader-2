import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from '../config';
import { resolveRequestId } from './request-id';

@Global()
@Module({
  imports: [LoggerModule.forRootAsync({
    inject: [APP_CONFIG],
    useFactory: (config: AppConfig) => ({
      pinoHttp: {
        level: config.LOG_LEVEL,
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        genReqId: (req, res) => {
          const id = resolveRequestId(req.headers['x-request-id']);
          res.setHeader('x-request-id', id);
          return id;
        },
      },
    }),
  })],
  exports: [LoggerModule],
})
export class ObservabilityModule {}
