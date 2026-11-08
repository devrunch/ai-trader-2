import { configureApp } from './app.setup';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { expect, it } from 'vitest';
import { AppModule } from './app.module';
import { loadConfig } from './shared/config';
import { Module } from '@nestjs/common';
import { DatabaseModule } from './shared/database';
import { KiteModule } from './shared/vendors/kite';
import { RedisModule } from './shared/redis';
import { isolateInstruments } from '../test/support/isolate-instruments';

@Module({})
class NoInfrastructureModule {}

// SRD §10.1; NFR-QL-1.
it('boots the Nest application', async () => {
  const testConfig = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: 'postgres://localhost/test', REDIS_URL: 'redis://localhost' });
  const module = await isolateInstruments(Test.createTestingModule({ imports: [AppModule.forRoot(testConfig)] }))
    .overrideModule(KiteModule).useModule(NoInfrastructureModule)
    .overrideModule(DatabaseModule).useModule(NoInfrastructureModule)
    .overrideModule(RedisModule).useModule(NoInfrastructureModule).compile();
  const app = module.createNestApplication();
  configureApp(app);
  try {
    await app.init();
    expect(app.getHttpServer()).toBeDefined();
  } finally {
    await app.close();
  }
});
