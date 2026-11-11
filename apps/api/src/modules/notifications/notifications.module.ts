import { randomUUID } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './api/notifications.controller';
import { Notifications } from './application/notifications';
import { DrizzleNotificationStore } from './infrastructure/drizzle-notification.store';

const logger = new Logger('Notifications');

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    { provide: Notifications, inject: [DB], useFactory: (db: Database) => new Notifications(new DrizzleNotificationStore(db), { id: randomUUID, warn: m => { logger.warn(m); } }) },
  ],
  exports: [Notifications],
})
export class NotificationsModule {}
