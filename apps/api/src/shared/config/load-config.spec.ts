import { describe, expect, it } from 'vitest';
import { kiteCredentials } from '../vendors/kite/kite-credentials';
import { ConfigError, loadConfig } from './load-config';

const required = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
};

// SRD §10.1, R-9, NFR-SC-1.
describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const config = loadConfig({ ...required, PORT: '9000', CORS_ORIGINS: 'https://a.com, https://b.com,' });
    expect(config.PORT).toBe(9000);
    expect(config.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });

  it('applies defaults', () => {
    const config = loadConfig(required);
    expect(config.PORT).toBe(8000);
    expect(config.LOG_LEVEL).toBe('silent');
    expect(config.CORS_ORIGINS).toEqual([]);
    expect(config.DATABASE_POOL_MAX).toBe(10);
    expect(config.API_INSTANCE_ID).toMatch(/^api-.+-\d+$/);
    expect(loadConfig({ ...required, API_INSTANCE_ID: 'api-test' }).API_INSTANCE_ID).toBe('api-test');
  });

  it('treats blank agent keys as unset and validates the provider/model form', () => {
    const blank = loadConfig({ ...required, AGENT_MODEL: '', ANTHROPIC_API_KEY: '', AWS_REGION: '', BEDROCK_BASE_URL: '' });
    expect(blank.AGENT_MODEL).toBeUndefined();
    expect(blank.AGENT_MAX_ROUNDS).toBe(6);
    expect(blank.AGENT_DAILY_TURNS).toBe(200);
    expect(loadConfig({ ...required, AGENT_MODEL: 'bedrock-mantle/deepseek.v3.2' }).AGENT_MODEL).toBe('bedrock-mantle/deepseek.v3.2');
    expect(() => loadConfig({ ...required, AGENT_MODEL: 'deepseek' })).toThrow(ConfigError);
  });

  it('accepts pool sizes from 1 to 100 (NFR-RB-3)', () => {
    for (const size of ['1', '10', '100']) {
      expect(loadConfig({ ...required, DATABASE_POOL_MAX: size }).DATABASE_POOL_MAX).toBe(Number(size));
    }
  });

  it('rejects invalid pool sizes (NFR-RB-3)', () => {
    for (const size of ['0', '101', '-1', '1.5', 'abc', '']) {
      expect(() => loadConfig({ ...required, DATABASE_POOL_MAX: size })).toThrow(ConfigError);
    }
  });

  it('reports all invalid keys at once', () => {
    expect.assertions(2);
    try {
      loadConfig({ LOG_LEVEL: 'silent', NODE_ENV: 'prod', PORT: 'abc', REDIS_URL: required.REDIS_URL });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      if (error instanceof ConfigError) {
        expect(error.issues.map((issue) => issue.key).sort()).toEqual(['DATABASE_URL', 'NODE_ENV', 'PORT']);
      }
    }
  });

  it('never echoes secret values in errors', () => {
    expect.assertions(3);
    try {
      loadConfig({ ...required, DATABASE_URL: 'mysql://u:s3cr3t@h/db' });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      if (error instanceof ConfigError) {
        expect(error.message).not.toContain('s3cr3t');
        expect(JSON.stringify(error.issues)).not.toContain('s3cr3t');
      }
    }
  });

  it('rejects non-http CORS origins', () => {
    expect.assertions(1);
    try {
      loadConfig({ ...required, CORS_ORIGINS: 'ftp://x' });
    } catch (error) {
      if (error instanceof ConfigError) {
        expect(error.issues.map((issue) => issue.key)).toEqual(['CORS_ORIGINS']);
      }
    }
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(loadConfig(required))).toBe(true);
  });
});

// FR-MD-3, NFR-SC-1.
describe('Kite configuration', () => {
  it('requires every Kite credential in production', () => {
    expect(kiteCredentials(loadConfig(required))).toBeNull();
    expect(kiteCredentials(loadConfig({ ...required, ZERODHA_API_KEY: 'key' }))).toBeNull();
    const configured = loadConfig({ ...required, NODE_ENV: 'production', SESSION_SECRET: 'production-secret-length-at-least-32-characters', ZERODHA_API_KEY: 'key',
      ZERODHA_API_SECRET: 'secret', ZERODHA_USER_ID: 'user', ZERODHA_PASSWORD: 'password', ZERODHA_TOTP_SECRET: 'totp' });
    expect(kiteCredentials(configured)).toEqual({ apiKey: 'key', apiSecret: 'secret', userId: 'user', password: 'password', totpSecret: 'totp' });
    try {
      loadConfig({ ...required, NODE_ENV: 'production' });
      expect.fail('must reject missing credentials');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      if (error instanceof ConfigError) expect(error.issues).toEqual(
        ['SESSION_SECRET', 'ZERODHA_API_KEY', 'ZERODHA_API_SECRET', 'ZERODHA_USER_ID', 'ZERODHA_PASSWORD', 'ZERODHA_TOTP_SECRET']
          .map((key) => ({ key, problem: 'required in production' })),
      );
    }
  });
  it('never echoes Kite credential values in configuration problems', () => {
    const secret = 'private-credential';
    expect(() => loadConfig({ ...required, NODE_ENV: 'production', SESSION_SECRET: 'production-secret-length-at-least-32-characters', ZERODHA_PASSWORD: secret })).toThrow(ConfigError);
    try { loadConfig({ ...required, NODE_ENV: 'production', SESSION_SECRET: 'production-secret-length-at-least-32-characters', ZERODHA_PASSWORD: secret }); }
    catch (error) {
      expect(String(error)).not.toContain(secret);
      if (error instanceof ConfigError) expect(JSON.stringify(error.issues)).not.toContain(secret);
    }
  });
});
