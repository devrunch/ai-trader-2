import { z } from 'zod';
import { hostname } from 'node:os';
import process from 'node:process';

const httpOrigin = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value);
  return url.username === '' && url.password === '' && url.pathname === '/' && url.search === '' && url.hash === '';
}, 'Expected an HTTP(S) origin');

/** `KEY=` in .env means unset, so the documented blank template boots. */
const unsetIfBlank = <T extends z.ZodType>(schema: T) => z.preprocess(value => (value === '' ? undefined : value), schema.optional());
const modelSpec = z.string().regex(/^[a-z-]+\/.+$/, 'provider/model');
const secret = z.string().min(1);

export const AppConfigSchema = z.object({
  ZERODHA_API_KEY: z.string().optional(),
  ZERODHA_API_SECRET: z.string().optional(),
  ZERODHA_USER_ID: z.string().optional(),
  ZERODHA_PASSWORD: z.string().optional(),
  ZERODHA_TOTP_SECRET: z.string().optional(),
  KITE_AUTO_LOGIN: z.enum(['true', 'false']).transform(value => value === 'true').default(false),
  KITE_REDIRECT_URL: z.url({ protocol: /^https?$/ }).optional(),
  // Ops alerts (email only). Unset SMTP_URL disables sending; alerts are then only logged.
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
  ALERT_EMAIL_FROM: z.string().min(3).optional(),
  // Email through Resend (preferred): API key plus a domain verified in Resend; alerts come from alerts@<domain>.
  RESEND_API_KEY: unsetIfBlank(secret),
  RESEND_DOMAIN: unsetIfBlank(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'a domain like example.com')),
  ALERT_EMAIL_TO: z.string().transform(value => value.split(',').map(part => part.trim()).filter(Boolean)).pipe(z.array(z.email())).default([]),
  // Agent model, any provider: `provider/model` (bedrock-mantle, anthropic, google, xai, openai, openai-compatible). Unset disables the assistant.
  AGENT_MODEL: unsetIfBlank(modelSpec),
  AGENT_FALLBACK_MODEL: unsetIfBlank(modelSpec),
  AGENT_BASE_URL: unsetIfBlank(z.url({ protocol: /^https?$/ })),
  AGENT_API_KEY: unsetIfBlank(secret),
  ANTHROPIC_API_KEY: unsetIfBlank(secret),
  OPENAI_API_KEY: unsetIfBlank(secret),
  XAI_API_KEY: unsetIfBlank(secret),
  GOOGLE_GENERATIVE_AI_API_KEY: unsetIfBlank(secret),
  BEDROCK_API_KEY: unsetIfBlank(secret),
  BEDROCK_BASE_URL: unsetIfBlank(z.url({ protocol: /^https$/ })),
  AWS_REGION: unsetIfBlank(secret),
  AWS_ACCESS_KEY_ID: unsetIfBlank(secret),
  AWS_SECRET_ACCESS_KEY: unsetIfBlank(secret),
  AWS_SESSION_TOKEN: unsetIfBlank(secret),
  AGENT_MAX_ROUNDS: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(40)).default(15),
  AGENT_TURN_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(5000).max(300_000)).default(90_000),
  AGENT_MAX_TOKENS: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1000).max(2_000_000)).default(120_000),
  AGENT_DAILY_TURNS: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(10_000)).default(200),
  // News: public RSS feeds need no key; NEWS_API_KEY adds newsapi.org global macro headlines.
  NEWS_API_KEY: unsetIfBlank(secret),
  APP_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535)).default(8000),
  MD_PORT: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535)).default(8001),
  MD_INSTANCE_ID: z.string().min(1).default(`${hostname()}-${String(process.pid)}`),
  API_INSTANCE_ID: z.string().min(1).default(`api-${hostname()}-${String(process.pid)}`),
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
