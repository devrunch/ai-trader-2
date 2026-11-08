import { Controller, Get, Res } from '@nestjs/common';
import { ReadinessRegistry } from '../application';

interface StatusResponse { status(code: number): void }

@Controller()
export class HealthController {
  constructor(private readonly readiness: ReadinessRegistry) {}

  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: StatusResponse) {
    const { ok, checks } = await this.readiness.runAll();
    response.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'error', checks };
  }
}
