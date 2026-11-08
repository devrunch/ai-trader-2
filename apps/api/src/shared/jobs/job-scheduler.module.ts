import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';
import { HEARTBEAT_SINK, defaultHeartbeatSink, type HeartbeatSink } from './heartbeat';
import { JobScheduler } from './job-scheduler';

@Global()
@Module({
  providers: [
    { provide: HEARTBEAT_SINK, useValue: defaultHeartbeatSink },
    { provide: JobScheduler, inject: [APP_CONFIG, HEARTBEAT_SINK],
      useFactory: (config: AppConfig, sink: HeartbeatSink) => new JobScheduler(config, sink) },
  ],
  exports: [JobScheduler, HEARTBEAT_SINK],
})
export class JobSchedulerModule {}
