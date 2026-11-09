import { AppConfigSchema, type AppConfig } from './app-config';

type ConfigIssue = { key: string; problem: string };

const problems: Record<string, string> = {
  NODE_ENV: 'expected development, test or production',
  PORT: 'expected an integer from 1 to 65535',
  DATABASE_URL: 'expected a postgres or postgresql URL',
  REDIS_URL: 'expected a redis or rediss URL',
  LOG_LEVEL: 'expected fatal, error, warn, info, debug, trace or silent',
  CORS_ORIGINS: 'expected comma-separated HTTP(S) origins',
};

export class ConfigError extends Error {
  readonly issues: ReadonlyArray<ConfigIssue>;

  constructor(issues: ReadonlyArray<ConfigIssue>) {
    super(`Invalid configuration: ${issues.map(({ key, problem }) => `${key} (${problem})`).join(', ')}`);
    this.name = 'ConfigError';
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const input = env.NODE_ENV === 'production' || env.SESSION_SECRET ? env : { ...env, SESSION_SECRET: 'development-session-secret-change-me-32' };
  const result = AppConfigSchema.safeParse(input);
  if (!result.success) {
    // NFR-SC-1: expose fixed descriptions, never validator input or payloads.
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    const missing = new Set(result.error.issues
      .filter((issue) => issue.code === 'custom' && issue.message === 'required in production')
      .map((issue) => String(issue.path[0])));
    throw new ConfigError(keys.map((key) => ({
      key, problem: missing.has(key) ? 'required in production' : (problems[key] ?? 'invalid value'),
    })));
  }
  Object.freeze(result.data.CORS_ORIGINS);
  return Object.freeze(result.data);
}
