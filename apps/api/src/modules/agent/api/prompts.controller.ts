import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { PromptRevertRequestSchema, PromptSaveRequestSchema } from '@aitrader/contracts';
import { CsrfHeaderGuard, Roles, RolesGuard, SessionGuard } from '../../auth/api/index';
import { PromptRegistry } from '../application/prompt-registry';

type AuthRequest = Request & { authUser?: { username: string } };
const author = (req: AuthRequest): string => req.authUser?.username ?? 'unknown';
const versionQuery = z.object({ from: z.coerce.number().int().nonnegative(), to: z.coerce.number().int().nonnegative() });

/** Admin prompt editing: versions like commits, diff, revert and reset (owner request 2026-11-10). */
@Controller('v1/admin/prompts')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class PromptsController {
  constructor(@Inject(PromptRegistry) private readonly prompts: PromptRegistry) {}

  @Get()
  async list() {
    return Promise.all(this.prompts.keys().map(async key => { const { version, source } = await this.prompts.active(key); return { key, version, source }; }));
  }

  @Get(':key')
  async detail(@Param('key') key: string) {
    const active = await this.prompts.active(key);
    return { active, history: await this.prompts.history(key) };
  }

  @Get(':key/diff')
  diff(@Param('key') key: string, @Query() query: unknown) {
    const { from, to } = versionQuery.parse(query);
    return this.prompts.diff(key, from, to);
  }

  @Post(':key') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  async save(@Param('key') key: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { content, message } = PromptSaveRequestSchema.parse(body);
    return { version: await this.prompts.save(key, content.replaceAll('\r\n', '\n'), message, author(req)) };
  }

  @Post(':key/revert') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  async revert(@Param('key') key: string, @Body() body: unknown, @Req() req: AuthRequest) {
    return { version: await this.prompts.revert(key, PromptRevertRequestSchema.parse(body).version, author(req)) };
  }

  @Post(':key/reset') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  async reset(@Param('key') key: string, @Req() req: AuthRequest) {
    return { version: await this.prompts.reset(key, author(req)) };
  }
}
