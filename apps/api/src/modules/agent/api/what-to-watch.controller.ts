import { Controller, Get, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { WhatToWatch } from '../application/what-to-watch';
import { userId, type AuthRequest } from './memory.controller';

/** What to watch for the signed-in user: read it, ask for a fresh one, and follow an item (which creates a task). */
@Controller('v1/what-to-watch')
@UseGuards(SessionGuard)
export class WhatToWatchController {
  constructor(@Inject(WhatToWatch) private readonly watch: WhatToWatch) {}

  @Get()
  get(@Req() req: AuthRequest) { return this.watch.get(userId(req)); }

  @Post('refresh') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  refresh(@Req() req: AuthRequest) { return this.watch.refresh(userId(req)); }

  @Post('items/:id/follow') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  follow(@Param('id') id: string, @Req() req: AuthRequest) { return this.watch.follow(userId(req), id); }
}
