import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { pipeUIMessageStreamToResponse, type UIMessageChunk } from 'ai';
import type { Request, Response } from 'express';
import { ChatRequestSchema, ThreadRenameRequestSchema } from '@aitrader/contracts';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { ChatService } from '../application/chat-service';
import { Threads } from '../application/threads';

type AuthRequest = Request & { authUser?: { id: string } };
const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};

/** The assistant: status, the streamed chat turn (AI SDK UI message stream) and the user's own threads (FR-AG-8, FR-AG-9). */
@Controller('v1/agent')
@UseGuards(SessionGuard)
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService, @Inject(Threads) private readonly threads: Threads) {}

  @Get('status')
  status() { return this.chat.status(); }

  @Post('chat') @UseGuards(CsrfHeaderGuard)
  async send(@Body() body: unknown, @Req() req: AuthRequest, @Res() res: Response): Promise<void> {
    const { id, message } = ChatRequestSchema.parse(body);
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableFinished) abort.abort(); });
    const stream = await this.chat.start({ userId: userId(req), threadId: id, message }, abort.signal);
    void pipeUIMessageStreamToResponse({ response: res, stream: stream as ReadableStream<UIMessageChunk> });
  }

  /** Runs to completion (about a minute) and answers with the text; the full exchange stays in its own thread. */
  @Post('brief') @HttpCode(200) @UseGuards(CsrfHeaderGuard)
  brief(@Req() req: AuthRequest) { return this.chat.brief(userId(req)); }

  @Get('threads')
  list(@Req() req: AuthRequest) { return this.threads.list(userId(req)); }

  @Get('threads/:id')
  messages(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.threads.messages(userId(req), id); }

  @Patch('threads/:id') @HttpCode(204) @UseGuards(CsrfHeaderGuard)
  async rename(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthRequest): Promise<void> {
    await this.threads.rename(userId(req), id, ThreadRenameRequestSchema.parse(body).title);
  }

  @Delete('threads/:id') @HttpCode(204) @UseGuards(CsrfHeaderGuard)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest): Promise<void> {
    await this.threads.remove(userId(req), id);
  }
}
