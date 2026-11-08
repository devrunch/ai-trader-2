import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { expect, it } from 'vitest';
import { AppModule } from './app.module';
import { loadConfig } from './shared/config';

// SRD §10.1; NFR-QL-1.
it('boots the Nest application', async () => {
  const testConfig = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://localhost/test', REDIS_URL: 'redis://localhost' });
  const module = await Test.createTestingModule({ imports: [AppModule.forRoot(testConfig)] }).compile();
  const app = module.createNestApplication();
  try {
    await app.init();
    expect(app.getHttpServer()).toBeDefined();
  } finally {
    await app.close();
  }
});
