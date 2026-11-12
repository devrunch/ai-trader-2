import { generateText, Output, type LanguageModel } from 'ai';
import type { RoleCall } from '../application/desk-roles';
import type { DeskModel } from '../application/trading-desk';

/** One structured model call per role on the (cheap) desk model: schema-checked JSON out, tokens counted. */
export class AiDeskModel implements DeskModel {
  constructor(private readonly model: Exclude<LanguageModel, string>, private readonly timeoutMs = 60_000) {}

  async generate<T>(call: RoleCall<T>, signal: AbortSignal): Promise<{ data: T; tokens: number }> {
    const result = await generateText({ model: this.model, instructions: call.system, prompt: call.prompt, temperature: 0, output: Output.object({ schema: call.schema }),
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) });
    const usage = result.usage;
    return { data: call.schema.parse(result.output), tokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) };
  }
}
