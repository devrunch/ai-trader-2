import { Logger } from '@nestjs/common';

export interface HeartbeatSink {
  beat(job: string, outcome: 'ok' | 'failed' | 'skipped', detail?: string): Promise<void>;
}
export const HEARTBEAT_SINK: symbol = Symbol('HEARTBEAT_SINK');
const logger = new Logger('JobsHeartbeat');
export const defaultHeartbeatSink: HeartbeatSink = {
  beat(job, outcome, detail) {
    logger.debug({ job, outcome, detail });
    return Promise.resolve();
  },
};
