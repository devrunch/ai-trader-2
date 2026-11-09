import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { DB, DatabaseModule, type Database } from '../../shared/database/index.js';
import { REDIS } from '../../shared/redis/index.js';
import type { Redis } from 'ioredis';
import { Login, Logout, CurrentUser, CreateAdmin } from './application/index.js';
import { USER_REPOSITORY } from './application/ports/user.repository.js';
import { PASSWORD_HASHER } from './application/ports/password-hasher.js';
import { SESSION_STORE } from './application/ports/session.store.js';
import { DrizzleUserRepository } from './infrastructure/drizzle-user.repository.js';
import { Argon2Hasher } from './infrastructure/argon2-hasher.js';
import { RedisSessionStore } from './infrastructure/redis-session.store.js';
import { AuthController } from './api/auth.controller.js';
import { AUTH_CLOCK, AuthRateLimitGuard } from './api/auth-rate-limit.guard.js';
import { RolesGuard, SessionGuard } from './api/session.guard.js';
import { CsrfHeaderGuard } from './api/csrf-header.guard.js';
import { ReadinessModule } from '../../shared/health/index.js';

@Module({ imports: [DatabaseModule, ReadinessModule], providers: [
  { provide: USER_REPOSITORY, inject: [DB], useFactory: (db: Database) => new DrizzleUserRepository(db) },
  { provide: PASSWORD_HASHER, useClass: Argon2Hasher },
  { provide: CreateAdmin, inject: [USER_REPOSITORY, PASSWORD_HASHER], useFactory: (users: ConstructorParameters<typeof CreateAdmin>[0], passwords: ConstructorParameters<typeof CreateAdmin>[1]) => new CreateAdmin(users, passwords) },
], exports: [USER_REPOSITORY, PASSWORD_HASHER, CreateAdmin] })
export class AuthPersistenceModule {}

@Module({ imports: [AuthPersistenceModule], controllers: [AuthController], providers: [
  { provide: SESSION_STORE, inject: [REDIS], useFactory: (redis: Redis) => new RedisSessionStore(redis) },
  { provide: Login, inject: [USER_REPOSITORY, PASSWORD_HASHER, SESSION_STORE], useFactory: (users: ConstructorParameters<typeof Login>[0], passwords: ConstructorParameters<typeof Login>[1], sessions: ConstructorParameters<typeof Login>[2]) => new Login(users, passwords, sessions) },
  { provide: Logout, inject: [SESSION_STORE], useFactory: (sessions: ConstructorParameters<typeof Logout>[0]) => new Logout(sessions) },
  { provide: CurrentUser, inject: [USER_REPOSITORY, SESSION_STORE], useFactory: (users: ConstructorParameters<typeof CurrentUser>[0], sessions: ConstructorParameters<typeof CurrentUser>[1]) => new CurrentUser(users, sessions) },
  { provide: 'AUTH_PRODUCTION', inject: [APP_CONFIG], useFactory: (config: AppConfig) => config.NODE_ENV === 'production' },
  { provide: AUTH_CLOCK, useValue: Date.now }, AuthRateLimitGuard, SessionGuard, RolesGuard, CsrfHeaderGuard,
], exports: [AuthPersistenceModule, CsrfHeaderGuard, CurrentUser, SessionGuard, RolesGuard] })
export class AuthModule {}
