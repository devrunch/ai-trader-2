import { RateLimitedError, UnavailableError } from '../../../shared/errors';
import { TurnBudget } from '../domain/turn-budget';
import type { ToolContext } from './guarded-tool';
import type { ActivePrompt } from './prompt-registry';

type TurnOutcome = 'ok' | 'error' | 'aborted' | 'budget:rounds' | 'budget:time' | 'budget:tokens';
export interface RunInput { system: string; messages: unknown[]; ctx: ToolContext; budget: TurnBudget; signal: AbortSignal }
export interface RunDone { outcome: TurnOutcome | (string & {}); tokens: number; messages: unknown[] }
/** Port: one streamed model turn with read tools. The infrastructure adapter is Mastra. */
export interface AgentRunner { readonly model: string; run(input: RunInput): { stream: ReadableStream<unknown>; done: Promise<RunDone> } }

export interface TurnStart { id: string; userId: string; threadId: string; promptKey: string; promptVersion: number; model: string; startedAt: string }
export interface TurnStore { start(turn: TurnStart): Promise<void>; finish(id: string, result: { outcome: string; tokens: number; finishedAt: string; tools: string[] }): Promise<void> }
/** `ensure` creates the thread on first use and returns its stored history; another user's thread is not found. */
export interface ThreadHistoryStore { ensure(userId: string, threadId: string, firstText: string): Promise<unknown[]>; saveMessages(userId: string, threadId: string, messages: unknown[]): Promise<void> }
export interface ChatStores { turns: TurnStore; threads: ThreadHistoryStore; memory?: { promptFor(userId: string): Promise<string> }; toolLog?: { take(turnId: string): string[] } }
export interface WindowLimiter { take(key: string, limit: number, windowMs: number): Promise<boolean> }
export interface ChatOptions { dailyTurns: number; maxRounds: number; turnTimeoutMs: number; maxTokens: number }
export interface ChatTurn { userId: string; threadId: string; message: unknown }

const SYSTEM_PROMPT = 'system';
const BRIEF = 'Use the day-trader skill. Cover: overnight US and Asia, crude, gold, the dollar (USD/INR), today\'s high-impact economic events '
  + 'with IST times and what they move (getEconomicCalendar), the headlines that matter (getNews), and NIFTY and BANKNIFTY levels to watch from the data. '
  + 'Under 250 words, bullet points with the numbers from the tools; end with one line of bias and what would change it.';
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 19_800_000;

const textOf = (message: unknown): string => {
  if (typeof message !== 'object' || message === null || !('parts' in message) || !Array.isArray(message.parts)) return '';
  for (const part of message.parts as unknown[]) {
    if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') return part.text;
  }
  return '';
};

/** One chat turn: availability, daily cap, the active prompt version, a turn budget, and a record of what ran (FR-AG-1..3). */
export class ChatService {
  constructor(private readonly runner: AgentRunner | null, private readonly prompts: { active(key: string): Promise<ActivePrompt> },
    private readonly stores: ChatStores, private readonly limiter: WindowLimiter, private readonly opts: ChatOptions,
    private readonly env: { now: () => number; id: () => string }) {}

  status(): { enabled: boolean; model: string | null } {
    return { enabled: this.runner !== null, model: this.runner?.model ?? null };
  }

  async start(turn: ChatTurn, signal: AbortSignal): Promise<ReadableStream<unknown>> {
    const runner = this.runner;
    if (!runner) throw new UnavailableError('The assistant is not configured: set AGENT_MODEL and its provider key in apps/api/.env');
    const now = this.env.now();
    const istNow = now + IST_OFFSET_MS;
    const day = new Date(istNow).toISOString().slice(0, 10);
    if (!(await this.limiter.take(`agent:daily:${turn.userId}:${day}`, this.opts.dailyTurns, DAY_MS))) {
      throw new RateLimitedError('Daily assistant limit reached; it resets at midnight IST', DAY_MS - (istNow % DAY_MS));
    }
    const prompt = await this.prompts.active(SYSTEM_PROMPT);
    const turnId = this.env.id();
    const history = await this.stores.threads.ensure(turn.userId, turn.threadId, textOf(turn.message).slice(0, 120));
    await this.stores.turns.start({ id: turnId, userId: turn.userId, threadId: turn.threadId, promptKey: prompt.key, promptVersion: prompt.version,
      model: runner.model, startedAt: new Date(now).toISOString() });
    const budget = new TurnBudget({ maxRounds: this.opts.maxRounds, maxMs: this.opts.turnTimeoutMs, maxTokens: this.opts.maxTokens });
    const remembered = this.stores.memory ? await this.stores.memory.promptFor(turn.userId) : '';
    const { stream, done } = runner.run({ system: prompt.content + remembered, messages: [...history, turn.message], budget,
      ctx: { userId: turn.userId, conversationId: turn.threadId, turnId },
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.opts.turnTimeoutMs)]) });
    void this.record(turnId, turn, done);
    return stream;
  }

  /** A background run (a fired task): the same turn as a chat message, read to the end with nobody listening. */
  /** The pre-market brief (SRD N1) in a thread of its own, so the user can ask follow-ups there. */
  async brief(userId: string): Promise<{ threadId: string; text: string; error: string | null }> {
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(this.env.now());
    const threadId = this.env.id();
    const { error, reply } = await this.runInBackground(userId, threadId, `Pre-market brief, ${date}. ${BRIEF}`);
    return { threadId, text: reply.trim(), error };
  }

  async runInBackground(userId: string, threadId: string, text: string): Promise<{ error: string | null; reply: string }> {
    let reply = '';
    try {
      const stream = await this.start({ userId, threadId, message: { id: this.env.id(), role: 'user', parts: [{ type: 'text', text }] } },
        AbortSignal.timeout(this.opts.turnTimeoutMs + 5000));
      const reader = stream.getReader();
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        const chunk = next.value as { type?: string; delta?: string };
        if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') reply += chunk.delta;
      }
      return { error: null, reply };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'background run failed', reply };
    }
  }

  private async record(turnId: string, turn: ChatTurn, done: Promise<RunDone>): Promise<void> {
    let result: { outcome: string; tokens: number };
    try {
      const value = await done;
      result = { outcome: value.outcome, tokens: value.tokens };
      await this.stores.threads.saveMessages(turn.userId, turn.threadId, value.messages);
    } catch {
      result = { outcome: 'error', tokens: 0 };
    }
    await this.stores.turns.finish(turnId, { ...result, tools: this.stores.toolLog?.take(turnId) ?? [], finishedAt: new Date(this.env.now()).toISOString() }).catch(() => undefined);
  }
}
