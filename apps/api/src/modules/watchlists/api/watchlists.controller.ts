import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { WatchlistAddSchema, WatchlistReplaceSchema, type Watchlist } from '@aitrader/contracts';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { Watchlists } from '../application/index';

type AuthRequest = Request & { authUser?: { id: string } };
const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};

@Controller('v1/watchlist')
@UseGuards(SessionGuard)
export class WatchlistsController {
  constructor(@Inject(Watchlists) private readonly lists: Watchlists) {}

  @Get()
  get(@Req() req: AuthRequest): Promise<Watchlist> { return this.lists.get(userId(req)); }

  /** The whole list in the user's order (drag to reorder). */
  @Put() @UseGuards(CsrfHeaderGuard)
  replace(@Req() req: AuthRequest, @Body() body: unknown): Promise<Watchlist> {
    return this.lists.replace(userId(req), WatchlistReplaceSchema.parse(body).items);
  }

  @Post('items') @UseGuards(CsrfHeaderGuard)
  add(@Req() req: AuthRequest, @Body() body: unknown): Promise<Watchlist> {
    return this.lists.add(userId(req), WatchlistAddSchema.parse(body).symbol);
  }

  @Delete('items/:symbol') @UseGuards(CsrfHeaderGuard)
  remove(@Req() req: AuthRequest, @Param('symbol') symbol: string): Promise<Watchlist> {
    return this.lists.remove(userId(req), symbol);
  }
}
