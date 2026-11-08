import { Global, Injectable, Module } from '@nestjs/common';

export type ReadinessResult = { status: 'up' } | { status: 'down'; reason: string };
type Check = () => Promise<ReadinessResult>;

@Injectable()
export class ReadinessRegistry {
  private readonly checks = new Map<string, Check>();

  register(name: string, check: Check): void {
    if (this.checks.has(name)) throw new Error(`Duplicate readiness check: ${name}`);
    this.checks.set(name, check);
  }

  async runAll(timeoutMs = 2000): Promise<{ ok: boolean; checks: Record<string, ReadinessResult> }> {
    const entries = await Promise.all([...this.checks].map(async ([name, check]) => {
      return [name, await this.runCheck(check, timeoutMs)] as const;
    }));
    const checks = Object.fromEntries(entries);
    return { ok: entries.every(([, result]) => result.status === 'up'), checks };
  }

  private async runCheck(check: Check, timeoutMs: number): Promise<ReadinessResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<ReadinessResult>((resolve) => {
        timer = setTimeout(() => { resolve({ status: 'down', reason: 'timeout' }); }, timeoutMs);
      });
      return await Promise.race([Promise.resolve().then(check), timeout]);
    } catch (error: unknown) {
      return { status: 'down', reason: (error instanceof Error ? error.message : String(error)).slice(0, 200) };
    } finally {
      clearTimeout(timer);
    }
  }
}

@Global()
@Module({ providers: [ReadinessRegistry], exports: [ReadinessRegistry] })
export class ReadinessModule {}
