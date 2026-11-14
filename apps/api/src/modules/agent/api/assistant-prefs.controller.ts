import { Body, Controller, Get, Inject, Put, Req, UseGuards } from '@nestjs/common';
import { AssistantPrefsSchema } from '@aitrader/contracts';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { AssistantPrefsService } from '../application/assistant-prefs';
import { userId, type AuthRequest } from './memory.controller';

/** Settings: how much the assistant may do on its own, and its limits. */
@Controller('v1/agent/prefs')
@UseGuards(SessionGuard)
export class AssistantPrefsController {
  constructor(@Inject(AssistantPrefsService) private readonly prefs: AssistantPrefsService) {}

  @Get()
  get(@Req() req: AuthRequest) { return this.prefs.get(userId(req)); }

  @Put() @UseGuards(CsrfHeaderGuard)
  set(@Body() body: unknown, @Req() req: AuthRequest) { return this.prefs.set(userId(req), AssistantPrefsSchema.parse(body)); }
}
