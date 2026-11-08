import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { expect, it } from 'vitest';
import { AppModule } from './app.module';

// SRD §10.1; NFR-QL-1.
it('boots the Nest application', async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  try {
    await app.init();
    expect(app.getHttpServer()).toBeDefined();
  } finally {
    await app.close();
  }
});
