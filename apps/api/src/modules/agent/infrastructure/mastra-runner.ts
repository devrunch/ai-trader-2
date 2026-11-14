import { Agent, type ModelWithRetries } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { toAISdkStream } from '@mastra/ai-sdk';
import { createUIMessageStream, type LanguageModel, type UIMessage } from 'ai';
import type { AgentRunner, RunDone, RunInput } from '../application/chat-service';
import type { GuardedTool, ToolContext } from '../application/guarded-tool';
import { SpecialTokenFilter } from './special-tokens';

type Model = Exclude<LanguageModel, string>;
const TOOL_CONTEXT = 'tool-context';
const SYSTEM = 'system-prompt';

const budgetText: Record<string, string> = {
  rounds: 'This answer needed more steps than one turn allows. Ask a narrower question or continue in a new message.',
  time: 'This answer took longer than one turn allows. Ask a narrower question or try again.',
  tokens: 'This answer used up the per-turn token budget. Ask a narrower question or continue in a new message.',
};

const isToolContext = (value: unknown): value is ToolContext =>
  typeof value === 'object' && value !== null && 'userId' in value && 'conversationId' in value && 'turnId' in value;
type MastraModel = ModelWithRetries['model'];
// Mastra bundles its own copy of the AI SDK provider types, which lag the installed ones; the runtime contract is the same (mastra-runner.spec.ts).
const toMastra = (model: Model): MastraModel => model as unknown as MastraModel;
const withFallback = (primary: Model, fallback: Model): ModelWithRetries[] => [{ model: toMastra(primary), maxRetries: 1 }, { model: toMastra(fallback), maxRetries: 1 }];

/** The Mastra adapter: any provider's model (with an optional fallback), the read tools, and the turn budget enforced per step. */
export class MastraRunner implements AgentRunner {
  readonly model: string;
  private readonly agent: Agent;
  private readonly activeTools: ((ctx: ToolContext) => string[]) | undefined;
  private readonly endTurn: ((ctx: ToolContext) => void) | undefined;

  constructor(opts: { name: string; primary: Model; fallback?: Model; tools: Array<GuardedTool<unknown, unknown>>;
    /** The tool names the model may see at this step; absent means all. */ activeTools?: (ctx: ToolContext) => string[]; endTurn?: (ctx: ToolContext) => void }) {
    this.model = opts.name;
    this.activeTools = opts.activeTools;
    this.endTurn = opts.endTurn;
    const tools = Object.fromEntries(opts.tools.map(tool => [tool.name, createTool({
      id: tool.name, description: tool.description, inputSchema: tool.input,
      execute: async (input, context) => {
        const ctx: unknown = context.requestContext.get(TOOL_CONTEXT);
        if (!isToolContext(ctx)) return { ok: false, reason: 'UNAVAILABLE' };
        return tool.call(ctx, input);
      },
    })]));
    this.agent = new Agent({
      id: 'trader', name: 'AI Trader assistant',
      instructions: ({ requestContext }) => String(requestContext.get(SYSTEM) ?? ''),
      model: opts.fallback ? withFallback(opts.primary, opts.fallback) : toMastra(opts.primary),
      tools,
    });
  }

  run(input: RunInput): { stream: ReadableStream<unknown>; done: Promise<RunDone> } {
    const abort = new AbortController();
    const onOuterAbort = () => { abort.abort(input.signal.reason); };
    input.signal.addEventListener('abort', onOuterAbort, { once: true });
    let tokens = 0;
    let exceeded: string | null = null;
    let settle!: (value: RunDone) => void;
    let fail!: (error: unknown) => void;
    const done = new Promise<RunDone>((resolve, reject) => { settle = resolve; fail = reject; });

    const requestContext = new RequestContext();
    requestContext.set(TOOL_CONTEXT, input.ctx);
    requestContext.set(SYSTEM, input.system);
    const original = input.messages as UIMessage[];

    const stream = createUIMessageStream<UIMessage>({
      originalMessages: original,
      execute: async ({ writer }) => {
        const output = await this.agent.stream(original, {
          // One step past the budget, so running out of rounds ends with the budget notice instead of stopping silently.
          requestContext, abortSignal: abort.signal,
          ...(this.activeTools ? { prepareStep: () => ({ activeTools: this.activeTools?.(input.ctx) ?? [] }) } : {}), maxSteps: input.budget.remaining().rounds + 1,
          onStepFinish: (step: { usage?: { totalTokens?: number | undefined; inputTokens?: number | undefined; outputTokens?: number | undefined } }) => {
            const used = step.usage?.totalTokens ?? (step.usage?.inputTokens ?? 0) + (step.usage?.outputTokens ?? 0);
            tokens += used;
            const verdict = input.budget.spend({ tokens: used });
            if (verdict !== 'ok') { exceeded = verdict.exceeded; abort.abort(new Error(`budget:${verdict.exceeded}`)); }
          },
        });
        const reader = toAISdkStream(output, { from: 'agent', version: 'v7' }).getReader();
        // The finish chunk closes the message, so a budget notice must go out before it.
        const filters = new Map<string, SpecialTokenFilter>();
        let finish: (typeof writer.write extends (chunk: infer C) => void ? C : never) | null = null;
        try {
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            const chunk = next.value;
            if (chunk.type === 'finish') finish = chunk;
            else if (chunk.type === 'text-delta') {
              const delta = (filters.get(chunk.id) ?? filters.set(chunk.id, new SpecialTokenFilter()).get(chunk.id))?.push(chunk.delta) ?? chunk.delta;
              if (delta) writer.write({ ...chunk, delta });
            } else if (chunk.type === 'text-end') {
              const rest = filters.get(chunk.id)?.flush();
              if (rest) writer.write({ type: 'text-delta', id: chunk.id, delta: rest });
              writer.write(chunk);
            } else writer.write(chunk);
          }
        } catch (error) {
          if (!exceeded && !input.signal.aborted) throw error;
        }
        if (exceeded) writer.write({ type: 'data-notice', data: { kind: 'budget', reason: exceeded, text: budgetText[exceeded] } } as never);
        if (finish) writer.write(finish);
      },
      onError: () => 'The assistant could not answer just now. Try again in a moment.',
      onEnd: ({ messages, isAborted }) => {
        input.signal.removeEventListener('abort', onOuterAbort);
        this.endTurn?.(input.ctx);
        const outcome = exceeded ? `budget:${exceeded}` : isAborted || input.signal.aborted ? 'aborted' : 'ok';
        settle({ outcome, tokens, messages });
      },
    });
    return { stream: stream.pipeThrough(new TransformStream({ flush: () => { fail(new Error('stream ended without finishing')); } })), done };
  }
}
