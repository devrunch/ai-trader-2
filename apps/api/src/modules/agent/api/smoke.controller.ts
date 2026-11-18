import { randomUUID } from 'node:crypto';
import { Body, Controller, Delete, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Database } from '../../../shared/database';
import { users } from '../../../shared/database/schema';
import { OpsTokenGuard } from '../../../shared/ops/index.js';
import { AgentTasks } from '../application/agent-tasks';
import { ChatService } from '../application/chat-service';
import { Threads } from '../application/threads';

const SMOKE_USER = 'ops-smoke';
/** Not a password hash any login can match: the smoke user exists only for these endpoints. */
const NO_LOGIN = 'disabled:smoke-user-cannot-log-in';
const AskSchema = z.strictObject({ text: z.string().trim().min(2).max(2000), keep: z.boolean().default(false) });
const FAILED = /"ok":false|"available":false/;

interface Chunk { type?: string; delta?: string; toolName?: string; toolCallId?: string; output?: unknown; data?: unknown; errorText?: string }

/**
 * End-to-end checks of the live assistant for the operator's tooling, behind OPS_READ_TOKEN: a real chat turn as a dedicated user that cannot log in
 * (paper only, like every user), with its answer, tool calls, failed lookups and the tasks it made. The chat is deleted afterwards unless `keep` is set.
 */
@Controller('v1/ops/smoke')
@UseGuards(OpsTokenGuard)
export class SmokeController {
  constructor(@Inject(DB) private readonly db: Database, @Inject(ChatService) private readonly chat: ChatService,
    @Inject(AgentTasks) private readonly tasks: AgentTasks, @Inject(Threads) private readonly threads: Threads) {}

  @Post('ask') @HttpCode(200)
  async ask(@Body() body: unknown): Promise<unknown> {
    const { text, keep } = AskSchema.parse(body);
    const userId = await this.smokeUser();
    const threadId = randomUUID();
    const before = new Set((await this.tasks.list(userId)).map(t => t.id));
    const started = Date.now();
    const stream = await this.chat.start({ userId, threadId, message: { id: randomUUID(), role: 'user', parts: [{ type: 'text', text }] } }, AbortSignal.timeout(180_000));
    let answer = ''; let notice: unknown = null; let error: string | null = null;
    const tools: string[] = []; const names = new Map<string, string>(); const failures: string[] = [];
    for await (const raw of stream as unknown as AsyncIterable<unknown>) {
      const c = raw as Chunk;
      if (c.type === 'text-delta' && c.delta) answer += c.delta;
      else if (c.type === 'tool-input-available' && c.toolName) { tools.push(c.toolName); if (c.toolCallId) names.set(c.toolCallId, c.toolName); }
      else if (c.type === 'tool-output-available') { const s = JSON.stringify(c.output); if (FAILED.test(s)) failures.push(`${names.get(c.toolCallId ?? '') ?? '?'}: ${s.slice(0, 300)}`); }
      else if (c.type === 'data-notice') notice = c.data;
      else if (c.type === 'error') error = c.errorText ?? 'error';
    }
    const created = (await this.tasks.list(userId)).filter(t => !before.has(t.id));
    if (!keep) await this.threads.remove(userId, threadId);
    return { ms: Date.now() - started, answer, tools, failures, notice, error, tasks: created.map(t => ({ id: t.id, title: t.title, state: t.state, trigger: t.trigger })) };
  }

  @Get('tasks')
  async listTasks(): Promise<unknown> {
    const userId = await this.smokeUser();
    return (await this.tasks.list(userId)).map(t => ({ id: t.id, title: t.title, state: t.state, runs: t.runs, lastRunAt: t.lastRunAt, lastError: t.lastError, lastOutcome: t.lastOutcome, trigger: t.trigger }));
  }

  @Delete() @HttpCode(204)
  async cleanup(): Promise<void> {
    const userId = await this.smokeUser();
    for (const t of await this.tasks.list(userId)) if (t.state === 'active' || t.state === 'paused') await this.tasks.setState(userId, t.id, 'cancelled');
    for (const thread of await this.threads.list(userId)) await this.threads.remove(userId, thread.id);
  }

  private async smokeUser(): Promise<string> {
    await this.db.insert(users).values({ username: SMOKE_USER, passwordHash: NO_LOGIN, role: 'user' }).onConflictDoNothing();
    const [row] = await this.db.select({ id: users.id }).from(users).where(eq(users.username, SMOKE_USER)).limit(1);
    if (!row) throw new Error('smoke user missing');
    return row.id;
  }
}
