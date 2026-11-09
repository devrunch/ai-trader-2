import { configureApp } from './app.setup';
/// <reference types="node" />
import 'reflect-metadata';
import process from 'node:process';
import { basename } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { ConfigError, loadConfig } from './shared/config';

export function loadRuntimeConfig(): ReturnType<typeof loadConfig> { return loadConfig(process.env); }

async function bootstrap(): Promise<void> {
  const config = loadRuntimeConfig();
  const app = await NestFactory.create(AppModule.forRoot(config), { bufferLogs: true });
  configureApp(app);
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.listen(config.PORT);
}

if (basename(process.argv[1] ?? '') === 'main.js') {
  void bootstrap().catch((error: unknown) => {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  });
}
