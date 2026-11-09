import { z } from 'zod';
import { hostname } from 'node:os';
import process from 'node:process';

const httpOrigin = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value);
  return url.username === '' && url.password === '' && url.pathname === '/' && url.search === '' && url.hash === '';
}, 'Expected an HTTP(S) origin');

export const AppConfigSchema = z.object({
  ZERODHA_API_KEY: z.string().optional(),
  ZERODHA_API_SECRET: z.string().optional(),
  ZERODHA_USER_ID: z.string().optional(),
  ZERODHA_PASSWORD: z.string().optional(),
  ZERODHA_TOTP_SECRET: z.string().optional(),
  KITE_AUTO_LOGIN: z.enum(['true', 'false']).transform(value => value === 'true').default(false),
  KITE_REDIRECT_URL: z.url({ protocol: /^https?$/ }).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535)).default(8000),
  MD_PORT: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535)).default(8001),
  MD_INSTANCE_ID: z.string().min(1).default(`${hostname()}-${String(process.pid)}`),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).default(10),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  SESSION_SECRET: z.string().min(32).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string()
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(httpOrigin)).default([]),
}).superRefine((config, context) => {
  if (config.NODE_ENV !== 'production') return;
  if (!config.SESSION_SECRET) context.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'required in production' });
  for (const key of ['ZERODHA_API_KEY', 'ZERODHA_API_SECRET', 'ZERODHA_USER_ID', 'ZERODHA_PASSWORD', 'ZERODHA_TOTP_SECRET'] as const) {
    if (!config[key]) context.addIssue({ code: 'custom', path: [key], message: 'required in production' });
  }
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
