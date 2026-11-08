import { Module, type OnModuleInit, Logger } from '@nestjs/common';
import { retry } from '@aitrader/resilience';
import { APP_CONFIG, type AppConfig } from '../../config';
import { DB, type Database } from '../../database';
import { ReadinessRegistry } from '../../health';
import { JobScheduler } from '../../jobs';
import { kiteCredentials, type KiteCredentials } from './kite-credentials';
import { createKiteHttp, createKiteTokenExchange, loginToKite } from './kite-login';
import { DrizzleKiteSessionRepository } from './kite-session.repository';
import { KiteSessionService } from './kite-session.service';

export class KiteRegistration implements OnModuleInit {
  constructor(private readonly credentials: KiteCredentials | null, private readonly service: KiteSessionService,
    private readonly scheduler: Pick<JobScheduler, 'register'>, private readonly readiness: ReadinessRegistry) {}
  async onModuleInit(): Promise<void> {
    this.readiness.register('kite', async () => {
      const status = await this.service.status();
      return status.valid ? { status: 'up' } : { status: 'down', reason: status.reason ?? 'no valid token' };
    });
    if (!this.credentials) return;
    await this.scheduler.register({ name: 'kite-session-refresh', cron: '20 6 * * *', tz: 'Asia/Kolkata',
      graceMs: 6 * 3600000, maxRuntimeMs: 120000,
      run: (signal) => retry((_attempt, signal) => this.service.refresh(signal), {
        retries: 2, baseMs: 1000, maxMs: 10000, signal,
        onRetry: () => { new Logger('KiteSession').warn('Kite session refresh failed; retrying'); },
      }),
    });
  }
}
@Module({
  providers: [
    { provide: KiteSessionService, inject: [APP_CONFIG, DB], useFactory: (config: AppConfig, database: Database) => {
      const credentials = kiteCredentials(config);
      return new KiteSessionService(credentials, new DrizzleKiteSessionRepository(database.$client),
        (creds, signal) => loginToKite(creds, createKiteHttp(), signal),
        (signal) => createKiteTokenExchange(credentials?.apiKey ?? '', signal));
    } },
    { provide: KiteRegistration, inject: [APP_CONFIG, KiteSessionService, JobScheduler, ReadinessRegistry],
      useFactory: (config: AppConfig, service: KiteSessionService, scheduler: JobScheduler, readiness: ReadinessRegistry) =>
        new KiteRegistration(kiteCredentials(config), service, scheduler, readiness) },
  ],
  exports: [KiteSessionService],
})
export class KiteModule {}
