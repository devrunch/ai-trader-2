import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ActionApplyRequestSchema } from '@aitrader/contracts';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { ActionCards } from '../application/action-cards';

type AuthRequest = Request & { authUser?: { id: string } };
const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};
const FailRequestSchema = z.strictObject({ reason: z.string().trim().min(1).max(300) });

/** Action cards the assistant proposed: the user applies (optionally edited), dismisses, or reports a failed apply (FR-AG-17). */
@Controller('v1/agent/actions')
@UseGuards(SessionGuard)
export class ActionsController {
  constructor(@Inject(ActionCards) private readonly cards: ActionCards) {}

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.cards.get(userId(req), id); }

  @Post(':id/apply') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  apply(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    return this.cards.apply(userId(req), id, ActionApplyRequestSchema.parse(body ?? {}).action);
  }

  @Post(':id/dismiss') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  dismiss(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.cards.dismiss(userId(req), id); }

  @Post(':id/fail') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  fail(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    return this.cards.fail(userId(req), id, FailRequestSchema.parse(body).reason);
  }
}
