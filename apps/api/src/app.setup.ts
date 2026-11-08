import type { INestApplication } from '@nestjs/common';
import { GlobalExceptionFilter } from './shared/errors';

function isExpress(instance: unknown): instance is { disable(name: string): void } {
  return (typeof instance === 'object' || typeof instance === 'function')
    && instance !== null && 'disable' in instance && typeof instance.disable === 'function';
}

export function configureApp(app: INestApplication): void {
  const instance: unknown = app.getHttpAdapter().getInstance();
  if (!isExpress(instance)) throw new Error('Application setup requires an Express adapter');
  instance.disable('x-powered-by');
  app.useGlobalFilters(app.get(GlobalExceptionFilter));
}
