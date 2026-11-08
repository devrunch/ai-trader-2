import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { ToxiProxyContainer } from '@testcontainers/toxiproxy';

export async function startPostgres() {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  return { url: container.getConnectionUri(), stop: async () => { await container.stop(); } };
}

export async function startRedis() {
  const container = await new RedisContainer('redis:8-alpine').start();
  return { url: container.getConnectionUrl(), stop: async () => { await container.stop(); } };
}

export async function withToxiproxy(target: { url: string }) {
  const url = new URL(target.url);
  const container = await new ToxiProxyContainer('ghcr.io/shopify/toxiproxy:2.12.0').start();
  try {
    const proxy = await container.createProxy({ name: 'dependency', upstream: `host.docker.internal:${url.port}` });
    url.hostname = proxy.host;
    url.port = String(proxy.port);
    return {
      url: url.toString(),
      cut: async () => { await proxy.setEnabled(false); },
      restore: async () => { await proxy.setEnabled(true); },
      stop: async () => { await container.stop(); },
    };
  } catch (error) {
    await container.stop();
    throw error;
  }
}
