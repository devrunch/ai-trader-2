import 'reflect-metadata';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { expect, it } from 'vitest';
import { APP_CONFIG, AppConfigModule, AppConfigSchema, type AppConfig } from './index';

@Injectable()
class ConfigConsumer {
  constructor(@Inject(APP_CONFIG) readonly config: AppConfig) {}
}

@Module({ providers: [ConfigConsumer], exports: [ConfigConsumer] })
class ConsumerModule {}

// SRD §10.1, R-9: sibling modules receive the same validated config.
it('provides APP_CONFIG globally', async () => {
  const cfg = AppConfigSchema.parse({ NODE_ENV: 'test', DATABASE_URL: 'postgres://localhost/test', REDIS_URL: 'redis://localhost' });
  const module = await Test.createTestingModule({
    imports: [AppConfigModule.forRoot(cfg), ConsumerModule],
  }).compile();
  try {
    expect(module.get(APP_CONFIG)).toBe(cfg);
    expect(module.get(ConfigConsumer).config).toBe(cfg);
  } finally {
    await module.close();
  }
});
