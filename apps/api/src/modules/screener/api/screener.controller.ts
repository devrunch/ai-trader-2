import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SavedScreenCreateSchema, SavedScreenUpdateSchema, ScanRequestSchema } from '@aitrader/contracts';
import type { Request } from 'express';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { listPresets, listSeries, SavedScreens, SCREENER_UNIVERSES, ScanService, type UniversePort } from '../application/index';
import { ScreenerRateLimitGuard } from './screener-rate-limit.guard';

type AuthRequest = Request & { authUser?: { id: string } };
const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};

/** Universes, presets, scans (rate limited: one scan reads up to 500 symbols' bars) and saved screens. */
@Controller('v1/screener')
@UseGuards(SessionGuard)
export class ScreenerController {
  constructor(@Inject(ScanService) private readonly scanner: ScanService, @Inject(SavedScreens) private readonly screens: SavedScreens,
    @Inject(SCREENER_UNIVERSES) private readonly universes: UniversePort) {}

  @Get('universes')
  async universeList() { return { items: await this.universes.list() }; }

  @Get('presets')
  presets() { return { items: listPresets() }; }

  /** The series names a custom condition may use besides its own indicators. */
  @Get('series')
  series() { return { items: listSeries() }; }

  @Post('scan') @HttpCode(200) @UseGuards(CsrfHeaderGuard, ScreenerRateLimitGuard)
  scan(@Body() body: unknown, @Req() req: AuthRequest) { return this.scanner.scan(userId(req), ScanRequestSchema.parse(body).spec); }

  @Get('screens')
  list(@Req() req: AuthRequest) { return this.screens.list(userId(req)); }

  @Post('screens') @UseGuards(CsrfHeaderGuard)
  create(@Body() body: unknown, @Req() req: AuthRequest) { return this.screens.create(userId(req), SavedScreenCreateSchema.parse(body)); }

  @Put('screens/:id') @UseGuards(CsrfHeaderGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest) { return this.screens.update(userId(req), id, SavedScreenUpdateSchema.parse(body)); }

  @Delete('screens/:id') @UseGuards(CsrfHeaderGuard)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.screens.remove(userId(req), id); }
}
