import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PineScriptCreateRequestSchema, PineScriptSaveRequestSchema, PineScriptVersionQuerySchema, type PineScriptDetail, type PineScriptSummary } from '@aitrader/contracts';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { PineScripts } from '../application/pine-scripts';

type AuthRequest = Request & { authUser?: { id: string } };
const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};

@Controller('v1/pine-scripts')
@UseGuards(SessionGuard)
export class PineScriptsController {
  constructor(@Inject(PineScripts) private readonly scripts: PineScripts) {}

  @Get()
  list(@Req() req: AuthRequest): Promise<{ scripts: PineScriptSummary[] }> { return this.scripts.list(userId(req)); }

  @Post() @UseGuards(CsrfHeaderGuard)
  create(@Body() body: unknown, @Req() req: AuthRequest): Promise<PineScriptDetail> {
    return this.scripts.create(userId(req), PineScriptCreateRequestSchema.parse(body));
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @Query() query: unknown, @Req() req: AuthRequest): Promise<PineScriptDetail> {
    return this.scripts.get(userId(req), id, PineScriptVersionQuerySchema.parse(query).version);
  }

  @Put(':id') @UseGuards(CsrfHeaderGuard)
  save(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest): Promise<PineScriptDetail> {
    return this.scripts.save(userId(req), id, PineScriptSaveRequestSchema.parse(body));
  }

  @Delete(':id') @HttpCode(204) @UseGuards(CsrfHeaderGuard)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest): Promise<void> {
    await this.scripts.remove(userId(req), id);
  }
}
