import { Global, Logger, Module } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config';
import { REDIS } from '../redis';
import { AlertGate } from './alert-gate';
import { DisabledNotifier, NOTIFIER, SmtpNotifier, type Notifier } from './notifier';

export function createNotifier(config: Pick<AppConfig, 'SMTP_URL' | 'ALERT_EMAIL_FROM' | 'ALERT_EMAIL_TO'>): Notifier {
  const logger = new Logger('Alerts');
  if (!config.SMTP_URL || !config.ALERT_EMAIL_FROM || config.ALERT_EMAIL_TO.length === 0) return new DisabledNotifier(message => { logger.warn(message); });
  return new SmtpNotifier(createTransport(config.SMTP_URL), config.ALERT_EMAIL_FROM, config.ALERT_EMAIL_TO, message => { logger.warn(message); });
}

@Global()
@Module({
  providers: [
    { provide: NOTIFIER, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createNotifier(config) },
    { provide: AlertGate, inject: [REDIS], useFactory: (redis: Redis) => new AlertGate(redis) },
  ],
  exports: [NOTIFIER, AlertGate],
})
export class NotifyModule {}
