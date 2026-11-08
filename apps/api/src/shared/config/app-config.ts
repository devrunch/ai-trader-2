import { z } from 'zod';

const httpOrigin = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value);
  return url.username === '' && url.password === '' && url.pathname === '/' && url.search === '' && url.hash === '';
}, 'Expected an HTTP(S) origin');

export const AppConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535)).default(8000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string()
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(httpOrigin)).default([]),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
