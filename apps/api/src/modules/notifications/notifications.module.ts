import { randomUUID } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { DB, type Database } from '../../shared/database';
import { NOTIFIER, AlertGate, type Notifier } from '../../shared/notify/index';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './api/notifications.controller';
import { EmailReports } from './application/email-reports';
import { Notifications } from './application/notifications';
import { DrizzleEmailPrefStore } from './infrastructure/drizzle-email-pref.store';
import { DrizzleNotificationStore } from './infrastructure/drizzle-notification.store';
import { NotifierReportMailer } from './infrastructure/notifier-report-mailer';

const logger = new Logger('Notifications');

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    { provide: EmailReports, inject: [DB, NOTIFIER, AlertGate, APP_CONFIG], useFactory: (db: Database, notifier: Notifier, gate: AlertGate, config: AppConfig) =>
      new EmailReports(new DrizzleEmailPrefStore(db), new NotifierReportMailer(notifier), gate, config.APP_URL) },
    { provide: Notifications, inject: [DB, EmailReports], useFactory: (db: Database, email: EmailReports) =>
      new Notifications(new DrizzleNotificationStore(db), { id: randomUUID, warn: m => { logger.warn(m); } }, email) },
  ],
  exports: [Notifications],
})
export class NotificationsModule {}
