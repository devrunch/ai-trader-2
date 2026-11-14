import { Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { AgentMemory } from '../application/agent-memory';

export type AuthRequest = Request & { authUser?: { id: string } };
export const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};

/** What the assistant remembers about the user: they can read every note and delete any of them. */
@Controller('v1/agent/memory')
@UseGuards(SessionGuard)
export class MemoryController {
  constructor(@Inject(AgentMemory) private readonly memory: AgentMemory) {}

  @Get()
  async list(@Req() req: AuthRequest) { return { notes: await this.memory.list(userId(req)) }; }

  @Delete(':id') @HttpCode(204) @UseGuards(CsrfHeaderGuard)
  async forget(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest): Promise<void> { await this.memory.forget(userId(req), id); }
}
