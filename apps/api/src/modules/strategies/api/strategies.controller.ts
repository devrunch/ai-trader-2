import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { BacktestRunRequestSchema, StrategyCreateSchema, StrategyUpdateSchema } from '@aitrader/contracts';
import type { Request } from 'express';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { Strategies } from '../application/strategies';
import { StrategiesRateLimitGuard } from './strategies-rate-limit.guard';

type AuthRequest = Request & { authUser?: { id: string } };
const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};

/** Saved strategies, and backtest runs (rate limited: each run reads thousands of bars and calls the compute service). */
@Controller('v1/strategies')
@UseGuards(SessionGuard)
export class StrategiesController {
  constructor(@Inject(Strategies) private readonly strategies: Strategies) {}

  @Get()
  list(@Req() req: AuthRequest) { return this.strategies.list(userId(req)); }

  @Post() @UseGuards(CsrfHeaderGuard)
  create(@Body() body: unknown, @Req() req: AuthRequest) { return this.strategies.create(userId(req), StrategyCreateSchema.parse(body)); }

  @Post('run') @HttpCode(200) @UseGuards(CsrfHeaderGuard, StrategiesRateLimitGuard)
  run(@Body() body: unknown, @Req() req: AuthRequest) { return this.strategies.run(userId(req), BacktestRunRequestSchema.parse(body)); }

  @Put(':id') @UseGuards(CsrfHeaderGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) { return this.strategies.update(userId(req), id, StrategyUpdateSchema.parse(body)); }

  @Delete(':id') @UseGuards(CsrfHeaderGuard)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.strategies.remove(userId(req), id); }
}
