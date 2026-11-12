import { Body, Controller, Get, Inject, Put, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { ConflictError } from '../../../shared/errors';
import { TradeLog } from '../application/agent-trader';
import type { BrokerOptIn } from '../application/execution-venue';

type AuthRequest = Request & { authUser?: { id: string } };
const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};
const Query$ = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
const OptInBody = z.strictObject({ brokerOptIn: z.boolean() });

export const EXECUTION_SETTINGS = Symbol('EXECUTION_SETTINGS');
export interface ExecutionSettings extends BrokerOptIn { set(userId: string, brokerOptIn: boolean): Promise<void>; readonly mode: 'paper' | 'broker'; readonly allowed: boolean }

/** The assistant's trade journal, and the execution venue setting (paper unless a development build is switched to broker and the user opted in). */
@Controller('v1/agent')
@UseGuards(SessionGuard)
export class TradesController {
  constructor(@Inject(TradeLog) private readonly log: TradeLog, @Inject(EXECUTION_SETTINGS) private readonly settings: ExecutionSettings) {}

  @Get('trades')
  async trades(@Query() raw: unknown, @Req() req: AuthRequest) { return { items: await this.log.list(userId(req), Query$.parse(raw).limit) }; }

  @Get('execution')
  async execution(@Req() req: AuthRequest) {
    return { venue: 'paper' as const, mode: this.settings.mode, brokerAllowed: this.settings.allowed, brokerOptIn: this.settings.allowed ? await this.settings.enabled(userId(req)) : false };
  }

  /** Refused unless the server is a non-production build in broker mode; the broker venue itself is still a stub. */
  @Put('execution') @UseGuards(CsrfHeaderGuard)
  async setExecution(@Body() body: unknown, @Req() req: AuthRequest) {
    const { brokerOptIn } = OptInBody.parse(body);
    if (!this.settings.allowed) throw new ConflictError('Broker execution is not available on this server; the assistant trades paper money only');
    await this.settings.set(userId(req), brokerOptIn);
    return { venue: 'paper' as const, mode: this.settings.mode, brokerAllowed: true, brokerOptIn };
  }
}
