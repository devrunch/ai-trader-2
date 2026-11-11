import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  IndicatorDefaultSetSchema, IndicatorPresetCreateSchema, IndicatorTemplateCreateSchema, IndicatorTemplatePatchSchema,
  type IndicatorPreset, type IndicatorTemplate,
} from '@aitrader/contracts';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { IndicatorPresets, IndicatorTemplates } from '../application';

type AuthRequest = Request & { authUser?: { id: string } };
const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};

/** Registered before IndicatorsController so `presets` and `templates` are not read as its `:ref`. */
@Controller('v1/indicators')
@UseGuards(SessionGuard)
export class IndicatorLibraryController {
  constructor(@Inject(IndicatorPresets) private readonly presets: IndicatorPresets, @Inject(IndicatorTemplates) private readonly templates: IndicatorTemplates) {}

  @Get('presets')
  async listPresets(@Req() req: AuthRequest): Promise<{ presets: IndicatorPreset[] }> { return { presets: await this.presets.list(userId(req)) }; }

  @Put('presets/defaults/:indicatorId') @UseGuards(CsrfHeaderGuard)
  async saveDefault(@Req() req: AuthRequest, @Param('indicatorId') indicatorId: string, @Body() body: unknown): Promise<{ preset: IndicatorPreset }> {
    return { preset: await this.presets.saveDefault(userId(req), indicatorId, IndicatorDefaultSetSchema.parse(body).inputs) };
  }

  @Post('presets') @UseGuards(CsrfHeaderGuard)
  async createPreset(@Req() req: AuthRequest, @Body() body: unknown): Promise<{ preset: IndicatorPreset }> {
    const { indicatorId, name, inputs } = IndicatorPresetCreateSchema.parse(body);
    return { preset: await this.presets.create(userId(req), indicatorId, name, inputs) };
  }

  @Delete('presets/:id') @HttpCode(204) @UseGuards(CsrfHeaderGuard)
  deletePreset(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> { return this.presets.remove(userId(req), id); }

  @Get('templates')
  async listTemplates(@Req() req: AuthRequest): Promise<{ templates: IndicatorTemplate[] }> { return { templates: await this.templates.list(userId(req)) }; }

  @Post('templates') @UseGuards(CsrfHeaderGuard)
  async createTemplate(@Req() req: AuthRequest, @Body() body: unknown): Promise<{ template: IndicatorTemplate }> {
    const { name, items } = IndicatorTemplateCreateSchema.parse(body);
    return { template: await this.templates.create(userId(req), name, items) };
  }

  @Patch('templates/:id') @UseGuards(CsrfHeaderGuard)
  async patchTemplate(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown): Promise<{ template: IndicatorTemplate }> {
    return { template: await this.templates.setFavourite(userId(req), id, IndicatorTemplatePatchSchema.parse(body).favourite) };
  }

  @Delete('templates/:id') @HttpCode(204) @UseGuards(CsrfHeaderGuard)
  deleteTemplate(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> { return this.templates.remove(userId(req), id); }
}
