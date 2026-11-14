import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AgentFeedbackRequestSchema, AgentProfileSchema } from '@aitrader/contracts';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { AgentProfileService } from '../application/agent-profile';
import { userId, type AuthRequest } from './memory.controller';

/** What the assistant knows about the user (profile, notes, learned signals): read, edit, delete, and mark replies useful or not. */
@Controller('v1/agent')
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(@Inject(AgentProfileService) private readonly profile: AgentProfileService) {}

  @Get('knowledge')
  knowledge(@Req() req: AuthRequest) { return this.profile.knowledge(userId(req)); }

  @Put('profile') @UseGuards(CsrfHeaderGuard)
  replace(@Body() body: unknown, @Req() req: AuthRequest) { return this.profile.replace(userId(req), AgentProfileSchema.parse(body)); }

  @Delete('learned') @HttpCode(204) @UseGuards(CsrfHeaderGuard)
  async forgetAll(@Req() req: AuthRequest): Promise<void> { await this.profile.forgetLearned(userId(req), null); }

  @Delete('learned/:id') @HttpCode(204) @UseGuards(CsrfHeaderGuard)
  async forget(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest): Promise<void> { await this.profile.forgetLearned(userId(req), id); }

  @Post('feedback') @HttpCode(204) @UseGuards(CsrfHeaderGuard)
  async feedback(@Body() body: unknown, @Req() req: AuthRequest): Promise<void> {
    const input = AgentFeedbackRequestSchema.parse(body);
    await this.profile.thumbs(userId(req), input.threadId, input.turnIndex, input.value);
  }
}
