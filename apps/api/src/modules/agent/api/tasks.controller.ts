import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AlertCreateSchema } from '@aitrader/contracts';
import type { Request } from 'express';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { AgentTasks } from '../application/agent-tasks';

type AuthRequest = Request & { authUser?: { id: string } };
const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};

/** The user's background assistant tasks and alerts: list, create alerts, pause, resume, cancel. */
@Controller('v1/agent/tasks')
@UseGuards(SessionGuard)
export class TasksController {
  constructor(@Inject(AgentTasks) private readonly tasks: AgentTasks) {}

  @Get()
  list(@Req() req: AuthRequest) { return this.tasks.list(userId(req)); }

  /** A user alert on a price or indicator condition. */
  @Post('alerts') @UseGuards(CsrfHeaderGuard)
  alert(@Body() body: unknown, @Req() req: AuthRequest) { return this.tasks.createAlert(userId(req), AlertCreateSchema.parse(body)); }

  @Post(':id/pause') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  pause(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.tasks.setState(userId(req), id, 'paused'); }

  @Post(':id/resume') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  resume(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.tasks.setState(userId(req), id, 'active'); }

  @Post(':id/cancel') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.tasks.setState(userId(req), id, 'cancelled'); }
}
