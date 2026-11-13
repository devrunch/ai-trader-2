import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { DeskBacktestRequestSchema, DeskRunRequestSchema } from '@aitrader/contracts';
import { z } from 'zod';
import type { Request } from 'express';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { DeskBacktests } from '../application/desk-backtest';
import { TradingDesk } from '../application/trading-desk';

type AuthRequest = Request & { authUser?: { id: string } };
const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};
const ListQuery = z.object({ symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/).optional(), limit: z.coerce.number().int().min(1).max(100).default(20) });

/** The trading desk: runs (now or as of a past time), their history, and desk backtests. Each run calls the model several times, so the daily cap applies. */
@Controller('v1/desk')
@UseGuards(SessionGuard)
export class DeskController {
  constructor(@Inject(TradingDesk) private readonly desk: TradingDesk, @Inject(DeskBacktests) private readonly backtests: DeskBacktests) {}

  @Post('runs') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  run(@Body() body: unknown, @Req() req: AuthRequest) {
    const { symbol, asOf, rounds } = DeskRunRequestSchema.parse(body);
    return this.desk.start(userId(req), { symbol, rounds, ...(asOf === undefined ? {} : { asOf: Date.parse(asOf) }) });
  }

  @Get('runs')
  async runs(@Query() raw: unknown, @Req() req: AuthRequest) { return { items: await this.desk.list(userId(req), ListQuery.parse(raw)) }; }

  @Get('runs/:id')
  runById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.desk.get(userId(req), id); }

  @Post('backtests/estimate') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  estimate(@Body() body: unknown, @Req() req: AuthRequest) { return this.backtests.estimate(userId(req), DeskBacktestRequestSchema.parse(body)); }

  @Post('backtests') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  start(@Body() body: unknown, @Req() req: AuthRequest) { return this.backtests.start(userId(req), DeskBacktestRequestSchema.parse(body)); }

  @Get('backtests')
  async list(@Query() raw: unknown, @Req() req: AuthRequest) { return { items: await this.backtests.list(userId(req), ListQuery.parse(raw).symbol) }; }

  @Get('backtests/:id')
  one(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.backtests.get(userId(req), id); }
}
