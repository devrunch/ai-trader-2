import { RequestMethod, type INestApplication } from '@nestjs/common';
import { GlobalExceptionFilter } from './shared/errors';
import cookieParser from 'cookie-parser';

function isExpress(instance: unknown): instance is { disable(name: string): void; set(name: string, value: unknown): void } {
  return (typeof instance === 'object' || typeof instance === 'function')
    && instance !== null && 'disable' in instance && typeof instance.disable === 'function' && 'set' in instance && typeof instance.set === 'function';
}

/** Express accepts a hop count, a CIDR/name list or a keyword; digits mean hops. */
export function parseTrustProxy(value: string): string | number { return /^\d+$/.test(value) ? Number(value) : value; }

export function configureApp(app: INestApplication, trustProxy = 'loopback'): void {
  const instance: unknown = app.getHttpAdapter().getInstance();
  if (!isExpress(instance)) throw new Error('Application setup requires an Express adapter');
  instance.disable('x-powered-by');
  // Take the client address from X-Forwarded-For only for hops in the trusted set (default: a local reverse proxy).
  instance.set('trust proxy', parseTrustProxy(trustProxy));
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.ALL }, { path: 'ready', method: RequestMethod.ALL }] });
  app.useGlobalFilters(app.get(GlobalExceptionFilter));
}
