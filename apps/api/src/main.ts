/// <reference types="node" />
import 'reflect-metadata';
import process from 'node:process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './shared/errors';
import { ConfigError, loadConfig } from './shared/config';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await NestFactory.create(AppModule.forRoot(config));
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(config.PORT);
}

void bootstrap().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
});
